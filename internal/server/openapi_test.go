package server

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const specPath = "../../api/openapi.yaml"

// specOnlyPaths are documented in the spec but not registered through
// routeTable: they are prefix-mounted file handlers (http.Handler, not
// http.HandlerFunc), so they cannot carry a route entry.
var specOnlyPaths = map[string]bool{
	"/stream/{camera_id}/{file}":     true,
	"/recordings/{camera_id}/{path}": true,
}

type securityReqs []map[string][]string

type specOperation struct {
	XAuth string `yaml:"x-auth"`
	// Security is a pointer so an absent key (inherits the document-level
	// security) is distinguishable from an explicit `security: []` (public).
	Security *securityReqs `yaml:"security"`
}

type apiSpec struct {
	OpenAPI string
	// security is the document-level default, inherited by any operation that
	// does not declare its own.
	security securityReqs
	// paths maps an OpenAPI path to its operations, keyed by lowercase method.
	paths map[string]map[string]specOperation
}

// effectiveSecurity resolves the OpenAPI inheritance rule: an operation without
// its own security requirement falls back to the document-level one.
func (s *apiSpec) effectiveSecurity(op specOperation) securityReqs {
	if op.Security != nil {
		return *op.Security
	}
	return s.security
}

var httpMethods = map[string]bool{
	"get": true, "post": true, "put": true, "patch": true, "delete": true,
}

// loadSpec parses just enough of the OpenAPI document to compare its surface
// with the route table: the paths, their methods, and each operation's auth.
func loadSpec(path string) (*apiSpec, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc struct {
		OpenAPI  string                          `yaml:"openapi"`
		Security securityReqs                    `yaml:"security"`
		Paths    map[string]map[string]yaml.Node `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	spec := &apiSpec{
		OpenAPI:  doc.OpenAPI,
		security: doc.Security,
		paths:    map[string]map[string]specOperation{},
	}
	for p, ops := range doc.Paths {
		for method, node := range ops {
			// Path items also hold non-operation keys (parameters, summary).
			if !httpMethods[strings.ToLower(method)] {
				continue
			}
			var op specOperation
			if err := node.Decode(&op); err != nil {
				return nil, fmt.Errorf("parse %s %s: %w", method, p, err)
			}
			if spec.paths[p] == nil {
				spec.paths[p] = map[string]specOperation{}
			}
			spec.paths[p][strings.ToLower(method)] = op
		}
	}
	return spec, nil
}

// diffRoutes reports every disagreement between the route table and the spec:
// undocumented routes, documented paths that no route serves, and operations
// whose declared auth does not match the middleware the route is wrapped in.
func diffRoutes(routes []route, spec *apiSpec) []string {
	var problems []string
	served := map[string]bool{}

	for _, rt := range routes {
		served[strings.ToLower(rt.method)+" "+rt.path] = true

		op, ok := spec.paths[rt.path][strings.ToLower(rt.method)]
		if !ok {
			problems = append(problems, fmt.Sprintf("rota não documentada na spec: %s %s", rt.method, rt.path))
			continue
		}
		if op.XAuth != rt.auth.String() {
			problems = append(problems, fmt.Sprintf(
				"x-auth divergente em %s %s: spec=%q rota=%q", rt.method, rt.path, op.XAuth, rt.auth))
		}
		// A public route must not advertise credentials; every other route must.
		sec := spec.effectiveSecurity(op)
		if secured := len(sec) > 0; secured == (rt.auth == authPublic) {
			problems = append(problems, fmt.Sprintf(
				"security incoerente em %s %s: auth=%q mas security=%v", rt.method, rt.path, rt.auth, sec))
		}
	}

	for p, ops := range spec.paths {
		if specOnlyPaths[p] {
			continue
		}
		for method := range ops {
			if !served[method+" "+p] {
				problems = append(problems, fmt.Sprintf(
					"path na spec sem rota correspondente: %s %s", strings.ToUpper(method), p))
			}
		}
	}

	sort.Strings(problems)
	return problems
}

// TestOpenAPISpecMatchesRoutes is the anti-drift guard: adding a route without
// documenting it (or documenting one that does not exist) fails the build.
func TestOpenAPISpecMatchesRoutes(t *testing.T) {
	spec, err := loadSpec(specPath)
	if err != nil {
		t.Fatalf("carregar spec: %v", err)
	}
	if !strings.HasPrefix(spec.OpenAPI, "3.1") {
		t.Errorf("openapi = %q, quer 3.1.x", spec.OpenAPI)
	}

	// The zero-value Server is enough: routeTable only takes method values.
	s := &Server{}
	problems := diffRoutes(s.routeTable(), spec)
	for _, p := range problems {
		t.Error(p)
	}
}

// TestOpenAPISpecDocumentsFileMounts pins the prefix-mounted handlers, which
// diffRoutes skips and would otherwise silently vanish from the spec.
func TestOpenAPISpecDocumentsFileMounts(t *testing.T) {
	spec, err := loadSpec(specPath)
	if err != nil {
		t.Fatalf("carregar spec: %v", err)
	}
	for p := range specOnlyPaths {
		if _, ok := spec.paths[p]["get"]; !ok {
			t.Errorf("mount %s não documentado na spec", p)
		}
	}
}

// sec builds an explicit operation-level security requirement.
func sec(reqs ...map[string][]string) *securityReqs {
	s := securityReqs(reqs)
	return &s
}

// bearer is the document-level default used by the real spec.
var bearer = securityReqs{{"bearerAuth": {}}, {"tokenQuery": {}}}

func TestDiffRoutesDetectsDivergence(t *testing.T) {
	secured := sec(map[string][]string{"bearerAuth": {}})

	tests := []struct {
		name   string
		routes []route
		spec   *apiSpec
		want   string
	}{
		{
			name:   "rota ausente na spec",
			routes: []route{{method: "GET", path: "/api/novo", auth: authFull}},
			spec:   &apiSpec{paths: map[string]map[string]specOperation{}},
			want:   "rota não documentada na spec: GET /api/novo",
		},
		{
			name:   "spec com path fantasma",
			routes: nil,
			spec: &apiSpec{paths: map[string]map[string]specOperation{
				"/api/fantasma": {"get": {XAuth: "full", Security: secured}},
			}},
			want: "path na spec sem rota correspondente: GET /api/fantasma",
		},
		{
			name:   "auth divergente",
			routes: []route{{method: "GET", path: "/api/users", auth: authAdmin}},
			spec: &apiSpec{paths: map[string]map[string]specOperation{
				"/api/users": {"get": {XAuth: "public"}},
			}},
			want: `x-auth divergente em GET /api/users: spec="public" rota="admin"`,
		},
		{
			name:   "rota autenticada sem security",
			routes: []route{{method: "GET", path: "/api/stats", auth: authFull}},
			spec: &apiSpec{paths: map[string]map[string]specOperation{
				"/api/stats": {"get": {XAuth: "full"}},
			}},
			want: "security incoerente em GET /api/stats",
		},
		{
			name:   "rota pública com security",
			routes: []route{{method: "POST", path: "/api/auth/login", auth: authPublic}},
			spec: &apiSpec{paths: map[string]map[string]specOperation{
				"/api/auth/login": {"post": {XAuth: "public", Security: secured}},
			}},
			want: "security incoerente em POST /api/auth/login",
		},
		{
			// Omitting `security: []` on a public operation silently inherits the
			// document-level requirement — it would document login as authenticated.
			name:   "rota pública que herda o security da raiz",
			routes: []route{{method: "POST", path: "/api/auth/login", auth: authPublic}},
			spec: &apiSpec{
				security: bearer,
				paths: map[string]map[string]specOperation{
					"/api/auth/login": {"post": {XAuth: "public"}},
				},
			},
			want: "security incoerente em POST /api/auth/login",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			problems := diffRoutes(tt.routes, tt.spec)
			if len(problems) == 0 {
				t.Fatalf("diffRoutes não detectou divergência, queria %q", tt.want)
			}
			found := false
			for _, p := range problems {
				if strings.Contains(p, tt.want) {
					found = true
				}
			}
			if !found {
				t.Errorf("diffRoutes = %v, queria conter %q", problems, tt.want)
			}
		})
	}
}

// TestDiffRoutesCleanWhenAligned mirrors how the real spec is written: a
// document-level security that every protected operation inherits, and an
// explicit `security: []` on the public ones.
func TestDiffRoutesCleanWhenAligned(t *testing.T) {
	routes := []route{
		{method: "POST", path: "/api/auth/login", auth: authPublic},
		{method: "GET", path: "/api/stats", auth: authFull},
	}
	spec := &apiSpec{
		security: bearer,
		paths: map[string]map[string]specOperation{
			"/api/auth/login": {"post": {XAuth: "public", Security: sec()}},
			"/api/stats":      {"get": {XAuth: "full"}},
		},
	}
	if problems := diffRoutes(routes, spec); len(problems) != 0 {
		t.Errorf("diffRoutes = %v, queria vazio", problems)
	}
}
