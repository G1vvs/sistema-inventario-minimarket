const _supabase = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

const TODAY = new Date();
function fmtDate(d){
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}
function daysAgo(n){const d=new Date(TODAY);d.setDate(d.getDate()-n);return fmtDate(d);}
function fmt(n){return "$"+Math.round(n).toLocaleString("es-CL");}
function fmtDateLabel(s){
  const [y,m,d]=s.split("-");
  const M=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${parseInt(d)} de ${M[parseInt(m)-1]} de ${y}`;
}

// --- LOGIN ---
async function login(email, password){
  const {error} = await _supabase.auth.signInWithPassword({email, password});
  if(error) throw error;
}
async function logout(){
  await _supabase.auth.signOut();
  location.reload();
}
async function getSession(){
  const {data:{session}} = await _supabase.auth.getSession();
  return session;
}

// --- SUPABASE: PRODUCTOS ---
async function dbLoadProductos(){
  const {data,error} = await _supabase
    .from('inv_products')
    .select('*, inv_categories(name)')
    .eq('is_active', true)
    .order('name');
  if(error){showToast('Error cargando productos','warn');return[];}
  return data.map(p=>({
    id:      p.id,
    nombre:  p.name,
    cat:     p.inv_categories?.name || 'Otro',
    precio:  p.price_clp,
    costo:   p.cost_clp,
    stock:   parseFloat(p.stock_qty),
    min:     parseFloat(p.stock_min),
    unit:    p.unit
  }));
}

// --- SUPABASE: CATEGORÍAS ---
async function dbLoadCategorias() {
  const { data, error } = await _supabase
    .from('inv_categories')
    .select('name')
    .order('name');
    
  if (error) {
    showToast('Error cargando categorías', 'warn');
    return [];
  }
  return data.map(c => c.name); // Retorna solo un arreglo de textos
}

async function dbSaveProducto(p){
  // Busca o crea la categoría
  let {data:cat} = await _supabase
    .from('inv_categories')
    .select('id')
    .eq('name', p.cat)
    .single();
  if(!cat){
    const {data:newCat} = await _supabase
      .from('inv_categories')
      .insert({name: p.cat})
      .select('id')
      .single();
    cat = newCat;
  }
  if(p.id){
    // UPDATE
    const {error} = await _supabase
      .from('inv_products')
      .update({
        name:        p.nombre,
        category_id: cat.id,
        price_clp:   p.precio,
        cost_clp:    p.costo,
        stock_qty:   p.stock,
        stock_min:   p.min
      })
      .eq('id', p.id);
    if(error) throw error;
  } else {
    // INSERT
    const {error} = await _supabase
      .from('inv_products')
      .insert({
        name:        p.nombre,
        category_id: cat.id,
        price_clp:   p.precio,
        cost_clp:    p.costo,
        stock_qty:   p.stock,
        stock_min:   p.min
      });
    if(error) throw error;
  }
}

// --- SUPABASE: VENTAS ---
async function dbLoadVentas(desde, hasta){
  const {data,error} = await _supabase
    .from('inv_sale_items')
    .select(`
      quantity,
      unit_price_clp,
      subtotal_clp,
      product_name_snapshot,
      inv_sales(sold_at, total_clp)
    `)
    .gte('inv_sales.sold_at', desde+'T00:00:00')
    .lte('inv_sales.sold_at', hasta+'T23:59:59')
    .order('inv_sales(sold_at)', {ascending: false});
  if(error){showToast('Error cargando ventas','warn');return[];}
  return (data||[])
    .filter(i=>i.inv_sales)
    .map(i=>{
      const d = new Date(i.inv_sales.sold_at);
      return {
        prod:  i.product_name_snapshot,
        qty:   parseFloat(i.quantity),
        total: i.subtotal_clp,
        hora:  d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}),
        fecha: d.toLocaleDateString('en-CA',{timeZone:'America/Santiago'})
      };
    });
}

async function dbConfirmarVenta(carritoItems, productos){
  // 1. Calcular total
  const total = carritoItems.reduce((a,c)=>a+c.precio*c.qty,0);

  // 2. Insertar cabecera de venta
  const {data:sale, error:saleErr} = await _supabase
    .from('inv_sales')
    .insert({total_clp: total, payment_method: 0})
    .select('id')
    .single();
  if(saleErr) throw saleErr;

  // 3. Insertar ítems (el trigger en DB descuenta el stock automáticamente)
  const items = carritoItems.map(c=>({
    sale_id:               sale.id,
    product_id:            c.id,
    product_name_snapshot: c.nombre,
    quantity:              c.qty,
    unit_price_clp:        c.precio,
    subtotal_clp:          c.precio * c.qty
  }));
  const {error:itemsErr} = await _supabase
    .from('inv_sale_items')
    .insert(items);
  if(itemsErr) throw itemsErr;
}

// --- ESTADO LOCAL (solo en memoria, se recarga desde DB) ---
let productos = [];
let ventas    = [];
let carrito   = [];
let catFiltro = "Todos";
let searchFiltro = "";
let chipActivo= "hoy";
let categorias = [];
let editingId = null;  // ID del producto en edición

// --- INIT ---
async function init(){
  const session = await getSession();
  if(!session){
    renderLogin();
    return;
  }
  
  // Cargamos todo desde la base de datos
  categorias = await dbLoadCategorias(); // <--- NUEVO
  productos  = await dbLoadProductos();
  ventas     = await dbLoadVentas(daysAgo(30), fmtDate(TODAY));
  
  renderInicio();
  updateBadge();
}

// Topbar date
document.getElementById("topbar-date").textContent=TODAY.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

const TITULOS={inicio:"Inicio",productos:"Productos",ventas:"Registrar venta",alertas:"Alertas de stock",historial:"Historial de ventas",reportes:"Reportes"};

function showTab(t){
  document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active"));
  document.getElementById("sec-"+t).classList.add("active");
  const navBtns=document.querySelectorAll(".nav-item");
  const idx=["inicio","productos","ventas","alertas","historial","reportes"].indexOf(t);
  if(navBtns[idx])navBtns[idx].classList.add("active");
  document.getElementById("topbar-title").textContent=TITULOS[t]||t;
  updateBadge();
  if(t==="inicio")renderInicio();
  if(t==="productos") {
    renderProductos();
    actualizarSelectCategorias();
  }
  if(t==="ventas")renderVentaForm();
  if(t==="alertas")renderAlertas();
  if(t==="historial")renderHistorial();
  if(t==="reportes")renderReportes();
}

function updateBadge(){
  const n=productos.filter(p=>p.stock<=p.min).length;
  const b=document.getElementById("badge-count");
  b.textContent=n;
  b.style.display=n>0?"":"none";
}

function estadoBadge(p){
  if(p.stock===0)return '<span class="badge badge-danger">Sin stock</span>';
  if(p.stock<=p.min)return '<span class="badge badge-warn">Stock bajo</span>';
  return '<span class="badge badge-ok">Normal</span>';
}

function renderInicio(){
  const hoy=fmtDate(TODAY);
  const vhoy=ventas.filter(v=>v.fecha===hoy);
  const totalV=vhoy.reduce((a,v)=>a+v.total,0);
  const bajos=productos.filter(p=>p.stock<=p.min).length;
  const gan=vhoy.reduce((a,v)=>{const p=productos.find(x=>x.nombre===v.prod);return a+(p?(p.precio-p.costo)*v.qty:0);},0);
  document.getElementById("metrics-bar").innerHTML=`
    <div class="metric"><div class="metric-label">Ventas hoy</div><div class="metric-value">${fmt(totalV)}</div><div class="metric-sub">${vhoy.length} transacciones</div></div>
    <div class="metric"><div class="metric-label">Ganancia estimada</div><div class="metric-value">${fmt(gan)}</div></div>
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${productos.length}</div><div class="metric-sub">en inventario</div></div>
    <div class="metric${bajos>0?' warn':''}"><div class="metric-label">Alertas de stock</div><div class="metric-value">${bajos}</div><div class="metric-sub">productos bajos</div></div>
  `;
  const ul=document.getElementById("recientes-list");
  if(!vhoy.length){ul.innerHTML='<div class="empty">Sin ventas registradas hoy</div>';return;}
  ul.innerHTML=vhoy.slice().reverse().slice(0,6).map(v=>`
    <div class="recent-item">
      <div class="ri-dot"></div>
      <span class="ri-name">${v.prod}</span>
      <span class="ri-meta">${v.qty} un. &middot; ${v.hora}</span>
      <span class="ri-total">${fmt(v.total)}</span>
    </div>`).join("");
}

function renderProductos(){
  const categoriasUnicas = [...new Set(productos.map(p=>p.cat))];


  // Renderizar las píldoras de categorías
  const cats=["Todos", ...categoriasUnicas];
  document.getElementById("cat-pills").innerHTML=cats.map(c=>`<button class="pill${c===catFiltro?' active':''}" onclick="setCat('${c}')">${c}</button>`).join("");
  
  // APLICAR LOS DOS FILTROS (Categoría y Buscador)
  let lista = productos;
  
  if (catFiltro !== "Todos") {
    lista = lista.filter(p => p.cat === catFiltro);
  }
  
  if (searchFiltro !== "") {
    lista = lista.filter(p => p.nombre.toLowerCase().includes(searchFiltro));
  }

  // Dibujar la tabla
  document.getElementById("tabla-productos").innerHTML=lista.map(p=>`
    <tr>
      <td title="${p.nombre}">${p.nombre}</td>
      <td>${p.cat}</td>
      <td>${fmt(p.precio)}</td>
      <td>${fmt(p.costo)}</td>
      <td>${p.stock}</td>
      <td>${estadoBadge(p)}</td>
      <td>
        <button class="btn-sm" onclick="editarProd(${p.id})">Editar</button>
        <button class="btn-sm" style="color: var(--danger-text); border-color: var(--danger-border); margin-left: 4px;" onclick="eliminarProducto('${p.id}', '${p.nombre}')">Eliminar</button>
      </td>
    </tr>`).join("")||`<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">No se encontraron productos con esa búsqueda</td></tr>`;
}

function setCat(c){catFiltro=c;renderProductos();}

function editarProd(id) {
  // 1. Buscamos el producto en el arreglo global
  const p = productos.find(x => x.id === id);
  if (!p) return;
  
  // 2. Guardamos el ID para saber que estamos en modo edición
  editingId = id;
  
  // 3. Rellenamos los campos de texto y números
  document.getElementById("p-nombre").value = p.nombre;
  document.getElementById("p-precio").value = p.precio;
  document.getElementById("p-stock").value = p.stock;
  document.getElementById("p-min").value = p.min;
  document.getElementById("p-costo").value = p.costo;
  
  // 4. Seleccionamos la categoría correcta buscando por su texto o valor
  const selectCat = document.getElementById("p-cat-select");
  const categoriaBuscada = p.cat ? p.cat.trim().toLowerCase() : "";
  let categoriaEncontrada = false;

  for (let i = 0; i < selectCat.options.length; i++) {
    const textoOpcion = selectCat.options[i].text.trim().toLowerCase();
    const valorOpcion = selectCat.options[i].value.trim().toLowerCase();

    // Comparamos todo limpio y en minúsculas
    if (textoOpcion === categoriaBuscada || valorOpcion === categoriaBuscada) {
      selectCat.selectedIndex = i;
      categoriaEncontrada = true;
      break;
    }
  }
  if (!categoriaEncontrada) {
    console.warn(`No pude emparejar la categoría "${p.cat}". Revisa que exista en la lista del select.`);
  }

  // 5. Ocultamos el input de "nueva categoría" por si acaso estaba visible
  const inputNuevaCat = document.getElementById("p-cat-input");
  if (inputNuevaCat) {
    inputNuevaCat.style.display = "none";
    inputNuevaCat.value = "";
  }
  
  // 6. Mostramos la pestaña y subimos la pantalla
  // (showTab llama a actualizarSelectCategorias que reconstruye el select,
  //  por eso volvemos a aplicar la categoría DESPUÉS de showTab)
  showTab('productos');

  // 7. Re-aplicamos la categoría porque showTab reconstruyó el select
  const selectCat2 = document.getElementById("p-cat-select");
  const catBuscada = p.cat ? p.cat.trim().toLowerCase() : "";
  for (let i = 0; i < selectCat2.options.length; i++) {
    if (selectCat2.options[i].value.trim().toLowerCase() === catBuscada ||
        selectCat2.options[i].text.trim().toLowerCase() === catBuscada) {
      selectCat2.selectedIndex = i;
      break;
    }
  }

  showToast("Producto cargado para editar");
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function agregarProducto() {
  const nombre = document.getElementById("p-nombre").value.trim();
  
  // --- AQUÍ ESTÁ LA CORRECCIÓN CLAVE ---
  // Ahora busca el nuevo ID del select
  let cat = document.getElementById("p-cat-select").value;
  
  // Si eligió "Escríbelo...", sacamos el valor del input oculto
  if (cat === "___NUEVA___") {
    cat = document.getElementById("p-cat-input").value.trim();
    if (!cat) { 
      showToast("Escribe el nombre de la nueva categoría", "warn"); 
      return; 
    }
  }
  // ------------------------------------

  const precio = parseInt(document.getElementById("p-precio").value) || 0;
  const stock = parseInt(document.getElementById("p-stock").value) || 0;
  const min = parseInt(document.getElementById("p-min").value) || 5;
  const costo = parseInt(document.getElementById("p-costo").value) || 0;
  
  if (!nombre || !precio) {
    showToast("Completa nombre y precio", "warn");
    return;
  }
  
  try {
    // 1. Guardar en Supabase
    await dbSaveProducto({id: editingId || null, nombre, cat, precio, costo, stock, min});
    editingId = null;
    
    // 2. Limpiar los campos de texto y números
    ["p-nombre", "p-precio", "p-stock", "p-min", "p-costo"].forEach(id => {
      document.getElementById(id).value = "";
    });
    
    // 3. Limpiar y ocultar la categoría
    const sel = document.getElementById("p-cat-select");
    const inputCat = document.getElementById("p-cat-input");
    if (sel) sel.value = "";
    if (inputCat) {
      inputCat.value = "";
      inputCat.style.display = "none";
    }
    
    // 4. Recargar datos desde Supabase
    categorias = await dbLoadCategorias(); 
    productos = await dbLoadProductos();
    
    // 5. Refrescar la pantalla
    renderProductos();
    actualizarSelectCategorias();
    updateBadge();
    
    showToast("Producto guardado ✓");
  } catch(e) {
    showToast("Error al guardar", "warn");
    console.error(e);
  }
}

function renderVentaForm(){
  const sel=document.getElementById("v-prod");
  sel.innerHTML=productos.filter(p=>p.stock>0).map(p=>`<option value="${p.id}">${p.nombre} (stock: ${p.stock})</option>`).join("");
  if(!sel.innerHTML)sel.innerHTML='<option disabled>Sin productos con stock</option>';
  sel.onchange=()=>{const p=productos.find(x=>x.id===parseInt(sel.value));if(p)document.getElementById("v-precio-unit").value=p.precio;};
  sel.dispatchEvent(new Event("change"));
  renderCarrito();
}

function agregarAlCarrito(){
  const id=parseInt(document.getElementById("v-prod").value);
  const qty=parseInt(document.getElementById("v-qty").value)||1;
  const precio=parseInt(document.getElementById("v-precio-unit").value)||0;
  const p=productos.find(x=>x.id===id);
  if(!p){showToast("Selecciona un producto","warn");return;}
  if(qty<1||qty>p.stock){showToast("Cantidad inválida o sin stock suficiente","warn");return;}
  const exist=carrito.find(c=>c.id===id);
  if(exist)exist.qty+=qty;else carrito.push({id,nombre:p.nombre,qty,precio});
  renderCarrito();showToast(`${p.nombre} agregado`);
}

function renderCarrito(){
  const el=document.getElementById("carrito-items");
  if(!carrito.length){el.innerHTML='<div class="empty" style="padding:1.5rem 0">Carrito vacío</div>';document.getElementById("total-venta").textContent="$0";return;}
  el.innerHTML=carrito.map((c,i)=>`
    <div class="carrito-item">
      <input type="number" class="ci-qty" value="${c.qty}" min="1" onchange="updateQty(${i},this.value)">
      <span class="ci-name">${c.nombre}</span>
      <span class="ci-price">${fmt(c.precio*c.qty)}</span>
      <button class="ci-del" onclick="removeCarrito(${i})" aria-label="Eliminar">✕</button>
    </div>`).join("");
  document.getElementById("total-venta").textContent=fmt(carrito.reduce((a,c)=>a+c.precio*c.qty,0));
}

function updateQty(i,v){carrito[i].qty=Math.max(1,parseInt(v)||1);renderCarrito();}
function removeCarrito(i){carrito.splice(i,1);renderCarrito();}

async function confirmarVenta(){
  if(!carrito.length){showToast("Carrito vacío","warn");return;}
  try{
    await dbConfirmarVenta(carrito, productos);
    carrito=[];
    productos=await dbLoadProductos();
    const {desde,hasta}=getRange();
    ventas=await dbLoadVentas(desde,hasta);
    renderCarrito();renderVentaForm();updateBadge();
    showToast("Venta confirmada ✓");
  }catch(e){showToast("Error al confirmar venta","warn");console.error(e);}
}

function renderAlertas(){
  const el=document.getElementById("alertas-list");
  const bajos=productos.filter(p=>p.stock<=p.min);
  if(!bajos.length){el.innerHTML='<div class="empty">Todo el stock está en orden ✓</div>';return;}
  el.innerHTML=bajos.map(p=>`
    <div class="alert-item${p.stock===0?' danger':''}">
      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div class="alert-text"><strong>${p.nombre}</strong> — ${p.stock===0?"Sin stock":"Stock: "+p.stock+" unidades"} (mínimo configurado: ${p.min})</div>
    </div>`).join("");
}

function setChip(c){
  chipActivo=c;
  ["hoy","semana","mes","custom"].forEach(x=>document.getElementById("chip-"+x).classList.toggle("active",x===c));
  document.getElementById("custom-dates").style.display=c==="custom"?"flex":"none";
  if(c!=="custom")renderHistorial();
}

function getRange(){
  const hoy=fmtDate(TODAY);
  if(chipActivo==="hoy")return{desde:hoy,hasta:hoy};
  if(chipActivo==="semana")return{desde:daysAgo(6),hasta:hoy};
  if(chipActivo==="mes")return{desde:daysAgo(29),hasta:hoy};
  const desde=document.getElementById("fecha-desde").value||daysAgo(30);
  const hasta=document.getElementById("fecha-hasta").value||hoy;
  return{desde,hasta};
}

async function renderHistorial(){
  const{desde,hasta}=getRange();
  ventas=await dbLoadVentas(desde,hasta);
  const filtradas=ventas.filter(v=>v.fecha>=desde&&v.fecha<=hasta);
  const totalM=filtradas.reduce((a,v)=>a+v.total,0);
  const totalQ=filtradas.reduce((a,v)=>a+v.qty,0);
  const dias=new Set(filtradas.map(v=>v.fecha)).size;
  document.getElementById("hist-metrics").innerHTML=`
    <div class="hist-metric"><div class="hm-label">Total período</div><div class="hm-value">${fmt(totalM)}</div></div>
    <div class="hist-metric"><div class="hm-label">Transacciones</div><div class="hm-value">${filtradas.length}</div></div>
    <div class="hist-metric"><div class="hm-label">Unidades</div><div class="hm-value">${totalQ}</div></div>
    <div class="hist-metric"><div class="hm-label">Días con ventas</div><div class="hm-value">${dias}</div></div>
  `;
  if(!filtradas.length){document.getElementById("historial-list").innerHTML='<div class="empty">Sin ventas en este período</div>';return;}
  const porFecha={};
  filtradas.forEach(v=>{if(!porFecha[v.fecha])porFecha[v.fecha]=[];porFecha[v.fecha].push(v);});
  const fechas=Object.keys(porFecha).sort((a,b)=>b.localeCompare(a));
  document.getElementById("historial-list").innerHTML=fechas.map(fecha=>{
    const items=porFecha[fecha];
    const totalDia=items.reduce((a,v)=>a+v.total,0);
    const esHoy=fecha===fmtDate(TODAY);
    return `
      <div class="fecha-block">
        <div class="fecha-hdr">
          <div class="fecha-hdr-left">
            ${fmtDateLabel(fecha)}
            ${esHoy?'<span class="badge badge-ok" style="font-size:10px">hoy</span>':''}
          </div>
          <div class="fecha-hdr-right">${items.length} venta${items.length>1?'s':''} &middot; ${fmt(totalDia)}</div>
        </div>
        <div class="fecha-rows">
          ${items.map(v=>`
            <div class="hist-row">
              <span class="hr-hora">${v.hora}</span>
              <span class="hr-prod">${v.prod}</span>
              <span class="hr-qty">${v.qty} un.</span>
              <span class="hr-total">${fmt(v.total)}</span>
            </div>`).join("")}
          <div class="dia-total">Total del día: <strong>${fmt(totalDia)}</strong></div>
        </div>
      </div>`;
  }).join("");
}

async function renderReportes(){
  ventas=await dbLoadVentas(daysAgo(29),fmtDate(TODAY));
  const totalV=ventas.reduce((a,v)=>a+v.total,0);
  const totalQ=ventas.reduce((a,v)=>a+v.qty,0);
  const margen=ventas.reduce((a,v)=>{const p=productos.find(x=>x.nombre===v.prod);return a+(p?(p.precio-p.costo)*v.qty:0);},0);
  const ticket=ventas.length?Math.round(totalV/ventas.length):0;
  document.getElementById("reporte-metrics").innerHTML=`
    <div class="metric"><div class="metric-label">Total vendido</div><div class="metric-value">${fmt(totalV)}</div></div>
    <div class="metric"><div class="metric-label">Unidades vendidas</div><div class="metric-value">${totalQ}</div></div>
    <div class="metric"><div class="metric-label">Ganancias </div><div class="metric-value">${fmt(margen)}</div></div>
    <div class="metric"><div class="metric-label">Gasto promedio por clientes</div><div class="metric-value">${fmt(ticket)}</div></div>
  `;
  const porCat={};
  ventas.forEach(v=>{const p=productos.find(x=>x.nombre===v.prod);const c=p?p.cat:"Otro";porCat[c]=(porCat[c]||0)+v.total;});
  const maxC=Math.max(...Object.values(porCat),1);
  document.getElementById("chart-cat").innerHTML=Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div class="bar-row"><span class="bar-lbl">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxC*100)}%"></div></div><span class="bar-val">${fmt(v)}</span></div>`).join("")||'<div class="empty">Sin datos</div>';
  const porProd={};
  ventas.forEach(v=>{porProd[v.prod]=(porProd[v.prod]||0)+v.qty;});
  const top=Object.entries(porProd).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxP=Math.max(...top.map(x=>x[1]),1);
  document.getElementById("chart-top").innerHTML=top.map(([k,v])=>`
    <div class="bar-row"><span class="bar-lbl">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/100*100)}%"></div></div><span class="bar-val">${v} un.</span></div>`).join("")||'<div class="empty">Sin datos</div>';
}

function showToast(msg,type){
  const t=document.getElementById("toast");
  t.textContent=msg;t.className="toast "+(type==="warn"?"warn":"ok");
  t.style.display="block";
  clearTimeout(t._to);t._to=setTimeout(()=>t.style.display="none",2500);
}

// --- LOGIN UI ---
function renderLogin(){
  document.querySelector('.layout').style.display='none';
  document.getElementById('toast').style.display='none';
  document.body.insertAdjacentHTML('beforeend',`
    <div id="login-screen" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);z-index:9999">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px;width:320px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
          <div style="width:36px;height:36px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600">Almacén Los Nietos</div>
            <div style="font-size:11px;color:var(--text3)">Gestión de inventario</div>
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom:12px">
          <label>Email</label>
          <input type="email" id="login-email" placeholder="correo@gmail.com" autocomplete="username">
        </div>
        
        <div class="form-group" style="margin-bottom:20px; position:relative;">
          <label>Contraseña</label>
          <input type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()" style="padding-right: 40px;">
          
          <button type="button" onclick="togglePassword()" style="position:absolute; right:10px; top:25px; background:none; border:none; cursor:pointer; color:var(--text3); padding:4px;">
            <svg id="eye-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
        </div>
        
        <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Entrar</button>
        <div id="login-error" style="color:var(--danger-text);font-size:12px;margin-top:10px;text-align:center;display:none"></div>
      </div>
    </div>
  `);
}

async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('login-error');
  err.style.display='none';
  try{
    await login(email,pass);
    document.getElementById('login-screen').remove();
    document.querySelector('.layout').style.display='flex';
    productos=await dbLoadProductos();
    ventas=await dbLoadVentas(daysAgo(30),fmtDate(TODAY));
    renderInicio();updateBadge();
  }catch(e){
    err.textContent='Email o contraseña incorrectos';
    err.style.display='block';
  }
}

function buscarProducto(texto) {
  searchFiltro = texto.toLowerCase();
  renderProductos();
}

async function dbLoadVentas(desde, hasta) {
  // Convertimos la medianoche de Chile a formato UTC universal
  const startIso = new Date(desde + 'T00:00:00').toISOString();
  const endIso = new Date(hasta + 'T23:59:59').toISOString();

  const {data,error} = await _supabase
    .from('inv_sale_items')
    .select(`
      quantity,
      unit_price_clp,
      subtotal_clp,
      product_name_snapshot,
      inv_sales!inner(sold_at, total_clp) 
    `)
    // Usamos las variables convertidas aquí
    .gte('inv_sales.sold_at', startIso)
    .lte('inv_sales.sold_at', endIso)
    .order('inv_sales(sold_at)', {ascending: false});
    
  if(error){showToast('Error cargando ventas','warn');return[];}
  
  return (data||[])
    .filter(i=>i.inv_sales)
    .map(i=>{
      const d = new Date(i.inv_sales.sold_at);
      return {
        prod:  i.product_name_snapshot,
        qty:   parseFloat(i.quantity),
        total: i.subtotal_clp,
        hora:  d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santiago'}),
        fecha: d.toLocaleDateString('en-CA',{timeZone:'America/Santiago'})
      };
    });
}

// --- SUPABASE: ELIMINAR PRODUCTO (Soft Delete) ---
async function dbDeleteProducto(id) {
  const { error } = await _supabase
    .from('inv_products')
    .update({ is_active: false })
    .eq('id', id);
    
  if (error) throw error;
}

// --- LÓGICA DE INTERFAZ ---
async function eliminarProducto(id, nombre) {
  // 1. Pedimos confirmación al usuario para evitar borrados por accidente
  const confirmar = confirm(`¿Estás seguro de que deseas eliminar el producto "${nombre}"?`);
  if (!confirmar) return;
  
  try {
    // 2. Desactivamos el producto en la base de datos
    await dbDeleteProducto(id);
    
    // 3. Recargamos los datos y actualizamos la pantalla
    productos = await dbLoadProductos(); 
    renderProductos(); 
    updateBadge(); // Por si borramos un producto que tenía alerta de stock
    
    showToast("Producto eliminado ✓");
  } catch(e) {
    showToast("Error al eliminar el producto", "warn");
    console.error(e);
  }
}

function actualizarSelectCategorias() {
  const sel = document.getElementById("p-cat-select");
  if (!sel) return;
  
  // Dibujamos las categorías de la base de datos y al final el botón de crear nueva
  sel.innerHTML = categorias.map(c => `<option value="${c}">${c}</option>`).join("") + 
                  `<option value="___NUEVA___" style="font-weight:bold; color:var(--accent);">+ Escríbelo...</option>`;
}

function toggleCatInput(valor) {
  const input = document.getElementById("p-cat-input");
  if (!input) return;
  
  if (valor === "___NUEVA___") {
    input.style.display = "block";
    input.focus();
  } else {
    input.style.display = "none";
    input.value = ""; // Limpiamos el texto si vuelve a elegir una opción normal
  }
}

function togglePassword() {
  const input = document.getElementById('login-pass');
  const icon = document.getElementById('eye-icon');
  
  if (input.type === 'password') {
    input.type = 'text';
    // Cambia el ícono al "ojo tachado"
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
  } else {
    input.type = 'password';
    // Vuelve al ícono de "ojo abierto"
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  }
}

init();
