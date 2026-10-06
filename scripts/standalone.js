import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
let html = await readFile(new URL('dist/index.html', root), 'utf8');
const js = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const css = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
if (!js || !css) throw new Error('Build assets not found');
const script = await readFile(new URL('dist/' + js[1].replace(/^\.\//, ''), root), 'utf8');
const styles = await readFile(new URL('dist/' + css[1].replace(/^\.\//, ''), root), 'utf8');
html = html
  .replace(
    js[0],
    () => `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`,
  )
  .replace(css[0], () => `<style>${styles}</style>`);
html = html.replace('<html', '<html data-demo="true"');
await writeFile(new URL('VitalView-Demo.html', root), html);
console.log('Built portable demo: VitalView-Demo.html');
