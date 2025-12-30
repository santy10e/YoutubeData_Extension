# 🎯 Metadata & Keywords Analyzer

Extensión para Chromium diseñada para creadores de contenido y youtubers que analizan videos de referencia para inspiración creativa, benchmarking y estudio de estrategias de títulos, miniaturas y keywords.

La extensión captura y organiza la metadata disponible de cada video que visitas, permitiendo revisarla sin salir de YouTube.

---

## 🚀 Funcionalidades principales

✔ Miniatura del video (HQ / MaxRes cuando está disponible)  
✔ Título, canal y fecha de publicación  
✔ Extracción de keywords (tags del video)  
✔ Visualización de descripción completa  
✔ Metadata técnica en formato JSON  
✔ Panel principal de análisis  
✔ Historial de videos inspiracionales  
✔ Opciones de copia rápida para keywords y metadata  

Todos los datos se almacenan **localmente en tu navegador** mediante `chrome.storage.local`.

No se envían datos a servidores externos.

---

## 🧩 Flujo de funcionamiento

1. El content script captura metadata del video
2. La envía al service worker
3. Se almacena en `chrome.storage.local`
4. El popup UI recibe el evento
5. La UI se actualiza y muestra:

- miniatura
- título
- canal
- fecha
- keywords
- descripción
- metadata técnica

Cada video analizado pasa al **historial de inspiración** para consulta posterior.

---


## 🧪 Casos de uso recomendados

✔ Inspiración para miniaturas y títulos  
✔ Research de tendencias y competencia  
✔ Benchmark visual  
✔ Identificación de patrones de keywords  
✔ Curaduría de referencias creativas  

Pensada para:

- Creadores de contenido
- Analistas de contenido
- Estrategas de YouTube
- Motion / Thumbnail designers
- Copywriters para títulos y previews

---

## 🖥 Instalación en modo desarrollador

1) Clonar el repositorio

```bash
git clone https://github.com/tu-repo/inspiraciones-youtube-extension
```

2) Abrir la página de extensiones

```
chrome://extensions
```

3) Activar

> Modo desarrollador

4) Cargar extensión descomprimida

5) Seleccionar la carpeta del proyecto

La extensión aparecerá en tu barra de extensiones.

---
 ## 🔐 Privacidad y seguridad

Esta extensión:

✔ No recolecta información personal  
✔ No envía datos a servidores externos  
✔ No usa cookies ni tracking  
✔ Almacena información únicamente en el navegador  

Uso orientado a análisis creativo y educativo.

---

## ⚠️ Disclaimer

Este proyecto **no está afiliado a YouTube ni Google**.

Su propósito es:

- análisis creativo
- benchmarking
- investigación de inspiración visual

Es responsabilidad del usuario cumplir los términos de uso de la plataforma.

---
## 📸 Screenshot
![alt text](1.png)
![alt text](2.png)

---

## 🤝 Contribución

Puedes contribuir mediante:

- mejoras de UI/UX
- optimización del parser
- refactorización de eventos
- aportes de diseño
- reportes de bugs