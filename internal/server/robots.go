package server

import "net/http"

// handleRobotsTxt nega indexação por completo — sistema privado (câmeras
// domésticas), sem razão pra motor de busca decidir sozinho o que indexar.
// Sem esta rota, GET /robots.txt caía no catch-all da SPA (spaHandler) e
// devolvia index.html (HTML) em vez de um robots.txt de verdade.
func (s *Server) handleRobotsTxt(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte("User-agent: *\nDisallow: /\n"))
}
