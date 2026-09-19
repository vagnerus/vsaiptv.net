export function getSourceHttpError(status) {
  const code = Number(status);
  if (code === 401 || code === 403) {
    return 'A fonte recusou o acesso ao canal. Solicite ao fornecedor uma URL autorizada e válida.';
  }
  if (code === 404 || code === 410) {
    return 'O canal não foi encontrado na fonte. A URL da transmissão precisa ser atualizada.';
  }
  return '';
}
