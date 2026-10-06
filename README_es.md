<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Exameow — Generador de preguntas de examen impulsado por IA: carga materiales de estudio, obtén preguntas en segundos">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="Licencia: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="Plataformas: Windows, macOS, Linux, Android, Web">
  <a href="https://hub.docker.com/r/ailm32442/exameow"><img src="https://img.shields.io/docker/pulls/ailm32442/exameow?style=flat-square&color=1A6CFF" alt="Descargas de Docker"></a>
</p>

<p align="center">
  <a href="README_zh.md"><b>简体中文</b></a> ·
  <a href="README_zh_TW.md"><b>繁體中文</b></a> ·
  <a href="README.md"><b>English</b></a> ·
  <a href="README_ja.md"><b>日本語</b></a> ·
  <a href="README_ko.md"><b>한국어</b></a> ·
  <a href="README_es.md"><b>Español</b></a> ·
  <a href="README_fr.md"><b>Français</b></a> ·
  <a href="README_de.md"><b>Deutsch</b></a> ·
  <a href="README_ru.md"><b>Русский</b></a> ·
  <a href="README_ar.md"><b>العربية</b></a>
</p>

<p align="center">
  <a href="https://exam.superagentparty.com/"><b>Demostración en vivo</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">Descargas</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## ¿Qué es Exameow?

**Exameow (过了喵)** es un **generador de preguntas de examen de código abierto impulsado por IA** que transforma tus materiales de estudio en preguntas de calidad de examen en cuestión de segundos. Carga archivos PDF, documentos de Word, presentaciones de PowerPoint, imágenes o texto: la IA lee el contenido y genera preguntas de selección única, selección múltiple, verdadero/falso, completar espacios y respuesta corta adaptadas a tus necesidades.

A diferencia de otras herramientas de generación de exámenes por IA que requieren registrar cuentas, suscripciones de pago o envían tus datos a la nube, Exameow está **diseñado con un enfoque local y centrado en la privacidad**. Tus bancos de preguntas, registros de práctica e historial de preguntas fallidas permanecen en tu dispositivo. Las aplicaciones de escritorio y móviles funcionan **completamente fuera de línea** con tu propia clave de API compatible con OpenAI (OpenAI, DeepSeek, Qwen, GLM o cualquier modelo autohospedado).

Para profesores y capacitadores, Exameow incluye un **sistema de exámenes en línea** integrado: publica exámenes desde tus bancos de preguntas locales, comparte un código de 6 dígitos y los estudiantes podrán unirse desde cualquier navegador. Incluye calificación instantánea, panel para profesores y protección contra abusos. Autohospeda toda la pila con un solo comando Docker.

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="Interfaz de escritorio y móvil de Exameow"></a>
</p>

## Demostración en vivo

Pruébalo en línea: **[exam.superagentparty.com](https://exam.superagentparty.com/)**

La demostración se ejecuta en Cloudflare Workers con el nivel gratuito de Workers AI:

- ⏳ **La cuota diaria es limitada** — La asignación gratuita de IA de Cloudflare se reinicia diariamente
- 📄 **Límite de ventana de contexto** — Los documentos grandes se truncarán para ajustarse a la ventana de contexto del modelo

Para un uso ilimitado, autohospeda con Docker o utiliza las aplicaciones de escritorio/móviles con tu propia clave de API.

## Características

### ✨ Generación de preguntas con IA — Carga archivos, obtén preguntas de examen

Exameow analiza materiales de estudio en **más de 10 formatos de archivo**: PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML e imágenes (PNG/JPG/WEBP/GIF/BMP). Carga un archivo o arrastra y suelta múltiples archivos a la vez. La IA genera preguntas en **5 tipos de preguntas**: selección única, selección múltiple, verdadero/falso, completar espacios y respuesta corta. Controla la cantidad de preguntas por tipo, el nivel de dificultad (fácil/medio/difícil), el idioma de salida y el filtrado por tema o capítulo. Los documentos grandes se dividen automáticamente y se generan en lotes con deduplicación. Funciona con cualquier API compatible con OpenAI (OpenAI, DeepSeek, Qwen, GLM, etc.) o utiliza la IA gratuita de Cloudflare en la demostración. Exporta los resultados como XLSX o CSV.

- **Formatos de entrada variados** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML, imágenes (PNG/JPG/WEBP/GIF/BMP) y cualquier archivo de texto/código; carga de múltiples archivos mediante arrastrar y soltar
- **5 tipos de preguntas** — Selección única, selección múltiple, verdadero/falso, completar espacios, respuesta corta, con control de cantidad por tipo
- **Control detallado** — Dificultad (fácil/medio/difícil), idioma de salida y filtrado por tema/capítulo
- **Lotes inteligentes** — Los documentos grandes se dividen automáticamente y se generan en lotes con deduplicación
- **Cualquier API compatible con OpenAI** — OpenAI, DeepSeek, Qwen, GLM, etc.; o utiliza la IA gratuita integrada de Cloudflare en la demo
- **Exportación** — Descarga resultados en formato XLSX o CSV

### 📚 Modos de práctica — Estudia de forma inteligente, no más dura

Convierte las preguntas generadas en sesiones de estudio interactivas. Practica en secuencia, mezcla preguntas y opciones al azar, o realiza un examen de prueba con límite de tiempo y hojas autogeneradas. Las preguntas fallidas se rastrean y revisan automáticamente: responde correctamente a una pregunta varias veces consecutivas y se borrará de la lista de errores. Alterna entre el modo examen (responder a ciegas) y el modo tarjeta de memoria (respuestas visibles). Las preguntas de respuesta corta son evaluadas por IA en comparación con las respuestas de referencia, con soporte para reevaluación manual. Importa y exporta bancos de preguntas mediante XLSX/CSV con mapeo inteligente de columnas.

- **Práctica secuencial** — Avanza a través del banco de preguntas en orden
- **Práctica aleatoria** — Preguntas u opciones desordenadas para mejorar la retención
- **Examen simulado** — Genera automáticamente un examen aleatorio a partir de cualquier banco con cantidad de tipos configurable
- **Revisión de preguntas fallidas** — Registra errores, practica solo lo que fallaste y observa cómo se eliminan a medida que mejoras
- **Modos Examen / Tarjeta** — Responde a ciegas o revisa las preguntas con las respuestas visibles
- **Calificación por IA** — Preguntas de respuesta corta calificadas por IA con comentarios según la respuesta de referencia; admite reevaluación manual
- **Gestión de bancos de preguntas** — Importa bancos desde XLSX/CSV con mapeo inteligente de columnas; exporta en cualquier momento

### 📝 Exámenes en línea — Publica e invita a estudiantes

Crea exámenes a partir de múltiples bancos de preguntas locales con cantidades de preguntas y valores de puntos configurables por tipo. Establece un título, hora de inicio y duración. Comparte un **código de 6 dígitos** o enlace de examen: los estudiantes se unen desde el navegador de cualquier dispositivo, sin necesidad de instalar aplicaciones. Un temporizador de cuenta regresiva local con envío automático mantiene la equidad; el progreso se conserva al recargar la página. Las preguntas objetivas se califican en el servidor al enviar, mostrando respuestas y análisis al instante. El panel del profesor muestra los resultados ordenados por puntuación con desglose por pregunta. Los datos del examen se eliminan automáticamente después de 7 días para proteger la privacidad. Antiabuso: 20 publicaciones por IP al día, las denuncias de estudiantes con un toque suspenden automáticamente el examen al recibir 3 denuncias de IP distintas. La **imagen de Docker es completamente autónoma**: el repetidor de exámenes funciona sobre SQLite sin ninguna dependencia del sitio de demostración.

- **Lanzar exámenes desde bancos** — Compón exámenes a partir de múltiples bancos locales con cantidad de preguntas y puntuación por tipo; establece título, hora de inicio y duración
- **Código de 6 dígitos + Enlace** — Los estudiantes se unen desde cualquier navegador sin instalar aplicaciones
- **Sesiones con tiempo** — Cuenta regresiva local con envío automático; el progreso se guarda tras recargar la página
- **Calificación instantánea** — Preguntas objetivas calificadas en el servidor con respuestas y análisis al enviar; resultados guardados localmente
- **Panel del profesor** — Resultados ordenados por puntuación con desglose por pregunta; almacenados en caché local para consultarse una sola vez al finalizar el examen; los profesores pueden eliminar un examen en cualquier momento (bloquea el acceso e inmuniza resultados)
- **Privacidad primero** — Los datos viven en Cloudflare D1 por un máximo de 7 días antes de su eliminación automática; las respuestas nunca se envían antes del envío final
- **Mecanismo antiabuso** — Límite de 20 publicaciones por IP al día; denuncias de estudiantes suspenden automáticamente tras 3 IP distintas; los administradores pueden revisar, restaurar o eliminar desde `#/admin`
- **Completamente autohospedado** — La imagen Docker incluye el mismo sistema (SQLite) sin depender de la demo; usa `ADMIN_TOKEN` para proteger el panel de administración (por defecto `pass`, obligatorio cambiar al primer acceso)

### 🔍 Modos de búsqueda — Encuentra respuestas rápidamente

Busca en los bancos de preguntas locales escribiendo o pegando una pregunta; la IA opcional proporciona explicaciones. La **búsqueda por foto** utiliza OCR en el dispositivo para reconocer preguntas de tu cámara o imágenes cargadas (el procesamiento ocurre localmente en tu navegador, sin cargas). La **búsqueda en vivo con cámara** apunta tu cámara a una pantalla o papel y la IA busca coincidencias en tiempo real. La **búsqueda por grabación de pantalla** te permite dibujar un marco de captura sobre cualquier ventana: la IA lo monitorea y muestra las respuestas en una superposición flotante (Windows/macOS/Linux/Android; no disponible en iOS debido a restricciones del sistema).

- **Búsqueda de texto** — Escribe o pega una pregunta para encontrar coincidencias en tus bancos locales, con opción de respuestas de IA
- **Búsqueda por foto** — Toma o sube una foto de una pregunta; OCR en el dispositivo (funciona en el navegador, sin subidas)
- **Búsqueda en vivo con cámara** — Apunta la cámara a la pantalla/papel; la IA monitorea y busca preguntas en tiempo real
- **Búsqueda por grabación de pantalla** — Dibuja un marco de captura en cualquier ventana; la IA monitorea e identifica preguntas con una superposición flotante (Windows / macOS / Linux / Android; no disponible en iOS debido a restricciones del sistema)

### 🌐 Multiplataforma y privacidad — Tus datos, tu dispositivo

Exameow se ejecuta en **Windows, macOS, Linux, Android y Web** (iOS mediante compilación propia). Despliega la versión web con **un solo comando Docker**. Todos los bancos de preguntas, registros de práctica e historial de errores se almacenan localmente: nada se sube a un servidor a menos que utilices el sistema de exámenes en línea. Las claves de API están cifradas con **AES-256-GCM** en escritorio. La interfaz detecta automáticamente el idioma del sistema con cambio rápido.

- **Escritorio y móvil** — Windows, macOS, Linux, Android (iOS mediante compilación propia)
- **Web autohospedada** — Despliegue con un solo comando Docker
- **Local-first** — Bancos de preguntas y registros permanecen en tu dispositivo; claves cifradas con AES-256-GCM en escritorio
- **Interfaz bilingüe / multilingüe** — Detecta automáticamente el idioma del sistema con cambio fácil

## Instalación

Los paquetes precompilados para todas las plataformas están disponibles en la página de [GitHub Releases](https://github.com/heshengtao/exameow/releases).

### Soporte de plataformas

| Plataforma | Estado | Descarga |
|------------|--------|----------|
| Windows | ✅ Soportado | Instalador `.msi` / `.zip` portable |
| macOS (Apple Silicon / Intel) | ✅ Soportado | `.dmg` (ver notas de lanzamiento para quitar cuarentena) |
| Linux (x86_64 / ARM64) | ✅ Soportado | `.AppImage` / `.deb` |
| Android (ARM64) | ✅ Soportado | `.apk` |
| iOS | ⚠️ Requiere compilación propia | Ver nota a continuación |
| Web / Docker (autohospedado) | ✅ Soportado | Imagen de Docker |

> **Sobre iOS:** Un certificado de desarrollador de Apple cuesta $99/año, por lo que actualmente no se proporciona un paquete precompilado para iOS; deberás compilarlo tú mismo con Xcode (`pnpm tauri ios build`). Si en el futuro las donaciones cubren la tarifa del certificado, se publicará una versión oficial firmada en GitHub Releases.

### Docker (Autohospedado)

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# Construir el frontend
cd frontend && pnpm install && pnpm build && cd ..

# Configurar el proveedor de IA
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-tu-clave-aqui
export AI_MODEL=gpt-4o

# Construir y ejecutar
docker compose up -d --build
```

Abre `http://localhost:3000`.

> **🔐 Token de administración (requerido para la administración de exámenes en línea):** la página de administración en `http://localhost:3000/#/admin` está protegida por `ADMIN_TOKEN`. Si no lo estableces, el valor predeterminado es **`pass`** y se te **forzará a cambiarlo en el primer inicio de sesión** antes de realizar cualquier acción. Para omitir esto, establécelo al iniciar:
>
> ```bash
> ADMIN_TOKEN=tu-token-seguro docker compose up -d --build
> ```
>
> El token cambiado persiste en el volumen `exameow-data` (`/app/data/admin_token.txt`) tras los reinicios del contenedor. Los datos del examen (SQLite) se almacenan en el mismo volumen.

### Docker (Imagen precompilada)

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-tu-clave-aqui \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=tu-token-seguro \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

Si no se establece `ADMIN_TOKEN`, el valor predeterminado es `pass` y debe cambiarse en la primera visita a `/#/admin`.

## Variables de entorno

| Variable | Predeterminado | Descripción |
|----------|----------------|-------------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | Punto de entrada de API compatible con OpenAI |
| `AI_API_KEY` | — | Tu clave de API de IA |
| `AI_MODEL` | `gpt-4o` | Modelo predeterminado a utilizar |
| `PORT` | `3000` | Puerto de escucha del servidor |
| `STATIC_DIR` | `/app/static` | Directorio de archivos estáticos |
| `ADMIN_TOKEN` | `pass` | Token de la página de administración; `pass` fuerza un cambio en el primer inicio en `/#/admin` |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | Ruta SQLite para el repetidor de exámenes en línea |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | Ubicación donde se persista el token de administración modificado |
| `RUST_LOG` | `info` | Nivel de registro (log) |

## Puntos de entrada de API (Endpoints)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/models` | Listar modelos de IA disponibles |
| `POST` | `/api/generate` | Cargar archivo y generar preguntas de examen |
| `GET` | `/api/export` | Exportar preguntas como CSV |
| `POST` | `/api/export/xlsx` | Exportar preguntas como XLSX |
| `POST` | `/api/config/save` | Guardar configuración de IA |
| `GET` | `/api/config/load` | Cargar configuración de IA guardada |

### Generar examen (Ejemplo)

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@material-de-estudio.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"Spanish"}'
```

## Arquitectura

Exameow tiene una **arquitectura de tres backends** que comparten la misma interfaz Vue 3. La misma SPA detecta automáticamente la plataforma en tiempo de ejecución y se enruta al backend correspondiente:

- **Tauri (escritorio/móvil)**: Los comandos de Rust en `src-tauri/` invocan directamente la biblioteca central de Rust.
- **Cloudflare Workers**: TypeScript en `workers/` llama a Cloudflare AI + D1 para el repetidor de exámenes en línea.
- **Axum (autohospedado/Docker)**: Servidor HTTP de Rust en `packages/server/` con SQLite para el repetidor de exámenes.

La lógica principal (análisis de archivos, cliente de IA, generación de exámenes, exportación) reside en el crate de Rust compartido `packages/core/`, duplicada en TypeScript para el flujo de Workers.

## Preguntas frecuentes (FAQ)

### ¿Cómo genero preguntas de examen a partir de un PDF?

Sube tu PDF arrastrándolo y soltándolo en el [sitio de demostración](https://exam.superagentparty.com/) o en la aplicación de escritorio. Selecciona los tipos de preguntas (selección única, selección múltiple, verdadero/falso, completar espacios, respuesta corta), define la cantidad de preguntas y la dificultad, luego haz clic en Generar. La IA leerá tu documento y creará las preguntas en segundos. Los resultados se pueden exportar como XLSX o CSV.

### ¿Exameow es realmente gratuito?

Sí. Exameow es de código abierto bajo la licencia Apache 2.0 y 100% gratuito. Sin planes de pago, sin niveles empresariales ni funciones bloqueadas. El sitio de demostración ofrece generación gratuita con IA (sujeto a los límites de cuota diaria del nivel gratuito de Cloudflare). Las aplicaciones de escritorio y móviles requieren tu propia clave de API de IA, la cual pagas directamente a tu proveedor de IA; Exameow nunca te cobrará.

### ¿Puedo usar Exameow fuera de línea (offline)?

Sí. Las aplicaciones de escritorio y móviles funcionan completamente fuera de línea. Los bancos de preguntas, los registros de práctica y el historial de errores se guardan localmente. Solo necesitas conexión a Internet al llamar a la API de IA para generar preguntas.

### ¿Qué modelos de IA admite Exameow?

Cualquier API compatible con OpenAI funciona: OpenAI (GPT-4o, GPT-4, GPT-3.5), DeepSeek, Qwen, GLM y modelos autohospedados mediante Ollama o herramientas similares. También puedes usar la IA gratuita de Cloudflare integrada en la demostración.

### ¿Cómo funciona la función de exámenes en línea?

Los profesores publican exámenes desde bancos de preguntas locales generando un código de 6 dígitos. Los estudiantes se unen desde cualquier navegador usando ese código o un enlace compartido. El examen tiene tiempo límite y envío automático. Las preguntas objetivas se califican al instante. Los datos del examen se eliminan automáticamente tras 7 días. Los usuarios de Docker obtienen el mismo sistema repetidor.

### ¿Están seguros mis datos?

Sí. Por defecto, todos los datos (bancos de preguntas, registros de práctica, claves de API) permanecen en tu dispositivo. Las claves de API se cifran con AES-256-GCM. La única excepción son los datos de los exámenes en línea, que se almacenan temporalmente en Cloudflare D1 (eliminación automática a los 7 días) o en tu SQLite autohospedado.

## Desarrollo

```bash
# Servidor Rust
cargo run -p exameow-server

# Servidor de desarrollo frontend
cd frontend && pnpm dev

# Aplicación de escritorio Tauri
pnpm tauri dev
```

### Estructura del proyecto

```
exameow/
├── frontend/          # Vue 3 SPA
├── packages/
│   ├── core/          # Biblioteca compartida de Rust (IA, analizador, exportación, configuración)
│   ├── server/        # Servidor HTTP Axum
│   └── shared/        # Tipos compartidos de TypeScript
├── src-tauri/         # Aplicación de escritorio + móvil Tauri
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # Scripts de compilación y despliegue
├── Dockerfile
└── docker-compose.yml
```

## Descargo de responsabilidad

- Este proyecto es una **herramienta de aprendizaje de código abierto**, destinada únicamente al estudio personal, la enseñanza y la capacitación interna.
- **No se garantiza la precisión del contenido generado por IA.** Las preguntas y los análisis pueden contener errores; revísalos antes de usarlos. Los autores no asumen responsabilidad alguna por las consecuencias derivadas del uso del contenido generado.
- **El contenido generado por los usuarios (UGC) es responsabilidad exclusiva de quien lo publica.** No utilices la función de examen en línea para almacenar o distribuir material ilícito, infractor o sensible. El operador puede eliminar contenido infractor sin previo aviso. Canales de denuncia: ① El botón **Reportar** integrado en cada página de examen — cuando 3 o más IP distintas denuncian el mismo examen, su enlace se **bloquea automáticamente y queda inaccesible** a la espera de revisión por parte del administrador; ② GitHub Issues. Las infracciones verificadas se eliminan; los exámenes suspendidos por error pueden ser restaurados por el administrador.
- El sitio de demostración (exam.superagentparty.com) es un servicio público gratuito **sin garantía de disponibilidad ni persistencia de datos** (los datos de los exámenes se conservan como máximo durante 7 días). Haz copias de seguridad de cualquier dato importante.
- Al utilizar este proyecto, aceptas todos los riesgos asociados y te comprometes a cumplir con las leyes de tu jurisdicción.

## Soporte

### ¡Danos una estrella!
⭐ Tu apoyo es el motor que nos impulsa a seguir adelante.

### ¡Propinas bienvenidas!
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### Síguenos
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### Únete a la comunidad
Si tienes alguna pregunta o problema con el proyecto, eres bienvenido a unirte a nuestra comunidad.

1. Grupo de QQ: `931057213` (Lleno) / `902882342` (Grupo 2)

2. Discord: [Enlace a Discord](https://discord.gg/f2dsAKKr2V)

## Colaboradores

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="Colaboradores de heshengtao/exameow" />
</a>

## Licencia

Apache-2.0

## Licencias de terceros

Este proyecto utiliza software de código abierto de terceros. Una lista completa de dependencias, sus licencias y las URL de las licencias se puede encontrar en [THIRD_PARTY_LICENSES.csv](THIRD_PARTY_LICENSES.csv).
