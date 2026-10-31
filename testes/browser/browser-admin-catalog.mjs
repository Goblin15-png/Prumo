// Build real, API fictícia e rede externa bloqueada. Não altera catálogo real.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const path = resolve(dist, `.${new URL(request.url, 'http://localhost').pathname}`);
    assert.ok(path.startsWith(dist));
    const file = extname(path) ? path : resolve(dist, 'index.html');
    response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const ingredients = [{id:1,name:'Ingrediente A'},{id:2,name:'Ingrediente B'},{id:3,name:'Ingrediente C'}];
const initial = {id:1,name:'Blend fictício',price:'49.90',stock:0,is_active:true,images:[],symptoms:[],tags:[],ingredients:[{...ingredients[0],pivot:{percentage:'50%'}},{...ingredients[1],pivot:{percentage:'50%'}}]};
const user = {id:1,name:'Proprietário teste',role:'admin',admin_profile:'owner',admin_permissions:['products.view','products.create','products.update','products.delete','taxonomy.view']};
const errors = [];
const contexts = [];
let browser;
async function scenario({ mobile = false, failCatalog = false } = {}) {
  const context = await browser.newContext({viewport:mobile ? {width:360,height:740} : {width:1440,height:1000}});
  contexts.push(context);
  const state = { failCatalog, failTaxonomy:false, rejectSave:false, writes:[], products:[structuredClone(initial)], holdSave:null };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/v1/')) return route.continue();
    const path = url.pathname.replace('/api/v1','');
    if (path === '/admin/auth/me') return route.fulfill({json:{user}});
    if (path === '/admin/products' && request.method() === 'GET') return route.fulfill(state.failCatalog ? {status:503,json:{message:'Falha de catálogo para teste.'}} : {json:{products:state.products}});
    if (path === '/admin/taxonomy') return route.fulfill(state.failTaxonomy ? {status:503,json:{}} : {json:{ingredients,tags:[],symptoms:[]}});
    if (path.startsWith('/admin/products') && ['POST','PUT'].includes(request.method())) {
      const payload = request.postDataJSON();
      state.writes.push(payload);
      if (state.holdSave) await state.holdSave;
      if (state.rejectSave) return route.fulfill({status:422,json:{message:'Confira os dados.',errors:{price:['Preço recusado no teste.']}}});
      const product = {...payload,id:1};
      state.products = [product];
      return route.fulfill({status:request.method() === 'POST' ? 201 : 200,json:{product}});
    }
    throw new Error(`Endpoint inesperado: ${request.method()} ${path}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror',(error) => errors.push(error.message));
  state.page = page;
  state.context = context;
  await page.goto(`${base}/admin`);
  await page.getByRole('heading',{name:'Gestão da loja',exact:true}).waitFor();
  state.create = async () => {
    await page.getByRole('button',{name:'Adicionar Blend',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'Cadastrar blend',exact:true});
    await dialog.getByPlaceholder('Ex: Aroma Sono Reparador 10ml').fill('Blend novo de teste');
    await dialog.getByPlaceholder('229.90').fill('29.90');
    return dialog;
  };
  return state;
}
try {
  browser = await chromium.launch({headless:true});
  const packaging = await scenario({mobile:true});
  let dialog = await packaging.create();
  for (const [label,value] of [['Largura (cm)','8'],['Altura (cm)','10'],['Comprimento (cm)','12'],['Peso (kg)','0.125']]) {
    const field = dialog.getByLabel(label,{exact:true});
    await field.fill(value);
    assert.equal(await field.evaluate((input) => input.validity.valid),true,`A embalagem deve aceitar ${label} = ${value}.`);
  }
  assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),true,'O formulário deve caber na largura móvel.');
  await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert.equal(packaging.writes.length,1);
  assert.equal(packaging.writes[0].shipping_weight_kg,'0.125');
  assert.equal(packaging.writes[0].shipping_width_cm,'8');
  assert.equal(Object.hasOwn(packaging.writes[0],'category_id'),false);
  console.log('OK: embalagem com centímetros inteiros e precisão de gramas no celular.');

  const bounds = await scenario();
  dialog = await bounds.create();
  const stock = dialog.getByLabel('Estoque inicial (unidades)',{exact:true});
  await stock.fill('1.5');
  assert.equal(await stock.inputValue(),'1.5','Estoque não deve ser truncado silenciosamente.');
  assert.equal(await stock.evaluate((input) => input.validity.valid),false);
  await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).click();
  assert.equal(bounds.writes.length,0);
  await stock.fill('1000001');
  assert.equal(await stock.evaluate((input) => input.validity.valid),false);
  await stock.fill('0');
  const price = dialog.getByLabel('Preço (R$) *',{exact:true});
  await price.fill('-1');
  assert.equal(await price.evaluate((input) => input.validity.valid),false);
  await price.fill('0');
  assert.equal(await price.evaluate((input) => input.validity.valid),true,'Preço zero continua permitido pelo contrato atual.');
  const width = dialog.getByLabel('Largura (cm)',{exact:true});
  await width.fill('500.01');
  assert.equal(await width.evaluate((input) => input.validity.valid),false);
  await width.fill('');
  const weight = dialog.getByLabel('Peso (kg)',{exact:true});
  await weight.fill('1000.001');
  assert.equal(await weight.evaluate((input) => input.validity.valid),false);
  await weight.fill('');
  assert.equal(await dialog.locator('form').evaluate((form) => form.checkValidity()),true,'Embalagem continua opcional e estoque zero é permitido.');
  console.log('OK: estoque fracionado não é convertido e limites respeitam o contrato existente.');

  const taxonomy = await scenario();
  await taxonomy.page.getByRole('button',{name:'Editar Blend fictício',exact:true}).waitFor();
  taxonomy.failTaxonomy = true;
  await taxonomy.page.getByRole('button',{name:'Editar Blend fictício',exact:true}).click();
  dialog = taxonomy.page.getByRole('dialog',{name:'Editar blend',exact:true});
  await dialog.getByRole('button',{name:'Recarregar opções do blend',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).isDisabled(),true);
  taxonomy.failTaxonomy = false;
  await dialog.getByRole('button',{name:'Recarregar opções do blend',exact:true}).click();
  await dialog.getByLabel('Nome do Produto / Blend *',{exact:true}).waitFor({state:'visible'});
  await dialog.getByLabel('Nome do Produto / Blend *',{exact:true}).fill('Blend preservado no teste');
  assert.equal(await dialog.getByLabel('Ingrediente 1',{exact:true}).locator('option[value="2"]').isDisabled(),true);
  await dialog.getByLabel('Ingrediente 1',{exact:true}).selectOption('3');
  assert.equal(await dialog.getByLabel('Ingrediente 2',{exact:true}).locator('option[value="3"]').isDisabled(),true);
  await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  assert.deepEqual(taxonomy.writes[0].ingredients.map((row) => row.id),[3,2]);
  console.log('OK: falha de opções pode ser recuperada e ingredientes não são duplicados.');

  const validation = await scenario();
  dialog = await validation.create();
  validation.rejectSave = true;
  await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'Preço recusado no teste.'}).waitFor();
  assert.equal(await dialog.getByLabel('Nome do Produto / Blend *',{exact:true}).inputValue(),'Blend novo de teste');
  await dialog.getByLabel('Preço (R$) *',{exact:true}).fill('39.90');
  validation.rejectSave = false;
  let releaseSave;
  validation.holdSave = new Promise((done) => { releaseSave = done; });
  const started = validation.page.waitForRequest((request) => request.url().endsWith('/admin/products') && request.method() === 'POST');
  await dialog.getByRole('button',{name:'Salvar no Catálogo',exact:true}).click();
  await started;
  assert.equal(await dialog.getByRole('button',{name:'Fechar formulário do blend',exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByLabel('Preço (R$) *',{exact:true}).isDisabled(),true);
  await dialog.locator('form').evaluate((form) => {
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  });
  releaseSave();
  await dialog.waitFor({state:'detached'});
  assert.equal(validation.writes.length,2,'Uma recusa e uma repetição corrigida; eventos duplicados não devem criar novos produtos.');
  assert.equal(validation.writes[1].price,'39.90');
  console.log('OK: erro de validação preserva o formulário e envio em andamento bloqueia duplicação/fechamento.');

  const catalog = await scenario({failCatalog:true});
  await catalog.page.getByRole('alert').filter({hasText:'Falha de catálogo para teste.'}).waitFor();
  assert.equal(await catalog.page.getByText('Nenhum blend cadastrado no servidor ainda.',{exact:true}).count(),0);
  catalog.failCatalog = false;
  await catalog.page.getByRole('button',{name:'Atualizar catálogo',exact:true}).click();
  await catalog.page.getByRole('button',{name:'Editar Blend fictício',exact:true}).waitFor();
  const review = catalog.page.getByRole('list',{name:'Revisão de Blend fictício',exact:true});
  await review.getByText('Sem estoque disponível.',{exact:true}).waitFor();
  await review.getByText('Embalagem incompleta para cotação de frete.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('OK: falha de catálogo não parece catálogo vazio; recarga e avisos operacionais disponíveis.');
} finally {
  for (const context of contexts) await context.close();
  await browser?.close();
  await new Promise((done) => server.close(done));
}
