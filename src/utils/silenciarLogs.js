// Em produção, não mostra mensagens internas no console do navegador.
// Erros e avisos continuam aparecendo. No localhost tudo aparece normal.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if (!local) {
    const nada = () => {};
    console.log = nada;
    console.info = nada;
    console.debug = nada;
}
