// postChangeRedirect decide para onde a ChangePasswordPage navega após trocar a
// senha com sucesso (fluxo forçado de 1º login, único que essa página atende):
// admin sem câmeras vai para o cadastro de câmera; senão, home.
export function postChangeRedirect(opts: { adminWithNoCameras: boolean }): string {
  return opts.adminWithNoCameras ? '/settings/cameras/new' : '/'
}
