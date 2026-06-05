# Sistema de Gestión de Inventario y Punto de Venta — Almacén Los Nietos

Este es un sistema web completo de control de inventario y punto de venta (POS) diseñado específicamente para optimizar la operación de un minimarket. La aplicación combina un frontend moderno, rápido y responsivo con un backend robusto en la nube, garantizando la consistencia de los datos y la seguridad de la información financiera del negocio.

## 🚀 Características Clave

### 📦 Gestión de Inventario Avanzada
* **CRUD Completo de Productos:** Permite añadir, editar y listar productos con control estricto de precios, costos, stock actual y stock mínimo de alerta.
* **Borrado Lógico (Soft Delete):** Los productos eliminados no se destruyen de la base de datos para no romper el historial de ventas pasadas; en su lugar, cambian su estado (`is_active: false`) ocultándose automáticamente de la interfaz.
* **Categorías Dinámicas:** El formulario de productos lee y carga en tiempo real las categorías existentes directamente desde la base de datos (`inv_categories`), incluyendo un mecanismo dinámico para registrar nuevas categorías al instante desde el propio formulario.
* **Tabla de Productos de Alta Densidad:** Diseñada para soportar cientos de registros con scroll interno independiente y encabezados fijos (`sticky headers`) para no perder la referencia de las columnas.

### 💰 Punto de Venta (POS) e Historial en Tiempo Real
* **Venta Fluida:** Interfaz ágil para registrar salidas de productos y confirmar transacciones inmediatamente.
* **Automatización por Hardware/Base de Datos:** Implementación de un *Trigger* nativo en PostgreSQL que descuenta automáticamente las unidades del stock físico en la tabla de productos inmediatamente después de confirmarse una venta.
* **Control de Fechas Multi-Zona Horaria:** Filtrado preciso por periodos (Hoy, Esta Semana, Este Mes, Personalizado) ajustado matemáticamente a la zona horaria local (`America/Santiago`), evitando desfases horarios UTC comunes en las ventas nocturnas.

### 📊 Dashboard Analítico y KPIs Financieros
El panel de control calcula de forma automática métricas críticas de negocio para la toma de decisiones:
* **Total Vendido:** Ingreso bruto total en caja dentro del periodo seleccionado.
* **Unidades Vendidas:** Sumatoria física de artículos que salieron del local.
* **Margen Bruto:** La ganancia neta real calculada dinámicamente (`Precio de Venta - Costo de Adquisición`) de los productos vendidos.
* **Ticket Promedio:** El gasto medio por cliente estimado en base a la relación entre transacciones totales e ingresos.
* **Gráficos de Rendimiento:** Desglose visual de ventas acumuladas por categoría y ranking de productos más vendidos.

### 🔒 Autenticación y Seguridad de Producción
* **Acceso Restringido:** Interfaz de Login corporativa con opción de visibilidad de contraseña (función show/hide password).
* **Puerta Pública Cerrada:** El registro de usuarios abiertos (`Signups`) está completamente bloqueado en el proveedor de autenticación. Las cuentas se gestionan exclusivamente en una lista blanca de forma manual.
* **Políticas RLS (Row Level Security):** Base de datos blindada a nivel de servidor; nadie sin una sesión activa y autorizada puede leer, editar o alterar las tablas del sistema.

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5 semántico, CSS3 con arquitectura de variables de diseño (*custom properties*), layouts fluidos y componentes flotantes anclados (`position: sticky`).
* **Lógica de Negocio:** JavaScript Moderno (ES6+) estructurado en módulos limpios y desacoplados del HTML (`app.js`).
* **Backend como Servicio (BaaS):** Supabase (PostgreSQL relacional, Auth Engine, Triggers PL/pgSQL).

## 📁 Estructura del Proyecto
```text
├── App/
│   ├── index.html       # Estructura principal de las pestañas y vistas (SPA)
│   ├── styles.css       # Diseño visual, paleta de colores modernos y responsividad
│   ├── app.js           # Lógica de interacción, renderizado dinámico y consultas a Supabase
│   └── config.js        # Variables de entorno y llaves de conexión API (Ignorado en Git)
├── .gitignore           # Archivo de protección para evitar la fuga de credenciales
└── README.md            # Documentación del proyecto
```
<img width="1904" height="917" alt="Screenshot 2026-06-05 131524" src="https://github.com/user-attachments/assets/bb9915b2-4da9-41c8-b5a2-4595f9505d78" />
<img width="1903" height="917" alt="Screenshot 2026-06-05 131517" src="https://github.com/user-attachments/assets/33d2a4b0-3dfe-4d93-91ff-6cc071a18f96" />
<img width="1903" height="914" alt="Screenshot 2026-06-05 131508" src="https://github.com/user-attachments/assets/eb24e0ee-e021-4f63-9b15-311c17b290c8" />
<img width="1899" height="914" alt="Screenshot 2026-06-05 131458" src="https://github.com/user-attachments/assets/f8f04fc5-bbd3-4f59-bccb-b953e859f824" />
<img width="1901" height="914" alt="Screenshot 2026-06-05 131430" src="https://github.com/user-attachments/assets/755462ea-bf9f-4c49-8b15-5f7a98f081fc" />
<img width="1904" height="913" alt="Screenshot 2026-06-05 131409" src="https://github.com/user-attachments/assets/53d8009c-296a-43c4-9022-8ba85a001bed" />
<img width="1903" height="915" alt="Screenshot 2026-06-05 131358" src="https://github.com/user-attachments/assets/2a369a83-a38c-4e73-ae2c-9866611aa61c" />
<img width="1919" height="1031" alt="Screenshot 2026-06-05 131343" src="https://github.com/user-attachments/assets/95b89679-fe44-4242-8d3a-717c4892f618" />
<img width="1906" height="918" alt="Screenshot 2026-06-05 131531" src="https://github.com/user-attachments/assets/3b2b0721-d961-4417-8a15-e9ab495f1680" />
