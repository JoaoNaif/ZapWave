// O que qualquer usuário logado pode saber sobre outro usuário. Sem e-mail,
// sem datas: é o que a busca por username devolve e o que as listagens
// (amigos, membros de sala) vão reaproveitar.
export interface UserSummaryDto {
  id: string
  username: string
  displayName: string
}
