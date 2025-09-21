# Árbol Genealógico 

Aplicación web para construir y visualizar árboles genealógicos con **dos raíces** (Papá y Mamá), relaciones **padre→hijo**, **parejas** (monogamia), búsqueda y algoritmos (DFS, BFS, profundidad, descendientes). Incluye exportación/importación **JSON** y exportación a **JPG**.

## Demo local
> GitHub Pages no ejecuta PHP; este proyecto se corre **local**.

1. Clona el repo y entra a la carpeta:
   ```bash
   git clone https://github.com/carlosmasnahh/arbol-genealogico.git
   cd arbol-genealogico
2. Opción rápida: abre index.html en tu navegador.
   O levanta un servidor estático:

   PHP
   php -S localhost:8080
   Abre http://localhost:8080
   
   Python
   python -m http.server 8080
   Abre http://localhost:8080

   *Si usas php/api.php, ejecuta con php -S en la raíz para que el endpoint esté disponible.*

   Funcionalidades:

    Dos raíces (Papá y Mamá) y múltiples raíces soportadas.

    Padre → hijo con prevención de ciclos y reubicación si ya tenía padre.

    Parejas (monogamia): si defines una nueva, reemplaza la anterior. Se limpian parejas colgantes al eliminar subárboles.

    Algoritmos: DFS, BFS, profundidad máxima, conteo de descendientes.

    Búsqueda por nombre (indexado).

    Exportar/Importar JSON y exportar JPG de la visualización.

    UI con Bootstrap, barra de Acciones rápidas y mini-toolbar.

    Visualización con Cytoscape + dagre (nodos con ícono de persona, parejas punteadas ♥).

    Estructura:
    .
    ├─ index.html           # UI Bootstrap + dropdowns + mini-toolbar
    ├─ app.js               # Estructura GeneTree, algoritmos, render y eventos
    ├─ php/
    │  └─ api.php           # (opcional) snapshot/loadSnapshot
    └─ assets/              # capturas (opcional)

    Tecnologías

    Frontend: HTML5, Bootstrap 5, Cytoscape.js, cytoscape-dagre.
    Backend: PHP para endpoints simples (php/api.php) de snapshot/loadSnapshot.

    Notas de despliegue:

    Local: php -S localhost:8080
    GitHub Pages: sólo frontend; PHP no corre en Pages.