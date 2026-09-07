// El firmador de URLs, sin credenciales: devuelve una dirección reconocible.
export const getSignedUrl = async (_client, cmd, { expiresIn } = {}) =>
    `https://firmado.example.org/${cmd.input?.Key}?exp=${expiresIn || 0}`;
export default { getSignedUrl };
