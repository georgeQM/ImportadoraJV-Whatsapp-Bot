const express = require('express');
const axios = require('axios');
const fs = require('fs');
//const { OpenAI } = require('openai');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config(); // Solo en desarrollo
}

const app = express();
app.use(express.json());

// Your credentials
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
let userState = {};
let productSelected = {};
let products = JSON.parse(fs.readFileSync('./productos.json', 'utf8'));

//const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log(`get: ${req.query['hub.verify_token']}`);

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});



// ===== MENÚ PRINCIPAL =====
async function sendMainMenu(phone) {
  userState[phone] = "main";
  await sendMessage(phone, `
🌟 ¡Hola, estimado cliente! 🌟  

Soy tu asistente virtual (JV-Bot) y estoy aquí para ayudarte 24/7.

Elige una opción:

*1.* Información de nuestros productos  

*2.* Precios unitarios  

Quieres hacer un PEDIDO o COTIZACIÓN
👉 Toca aquí:  https://wa.me/59167978690

Quieres ser DISTRIBUIDOR o buscas ASESORAMIENTO TÉCNICO
👉 Toca aquí:  https://wa.me/59175013747

🏢 Visita nuestras oficinas:
📍 https://maps.app.goo.gl/uThu6u3qta1fNk7p7

💻 Visita nuestra WEB 24/7
🌐 importadorajv.com

  `.trim());
}

// ===== SUBMENÚS =====
async function sendProductosMenu(phone) {
  userState[phone] = "in_productos";

  // Ordenamos los productos por ID
  const productosOrdenados = products.sort((a, b) => a.Id - b.Id);

  // Construimos el mensaje con formato bonito
  let mensaje = `*Información de nuestros productos*\n\nElige un producto:\n\n`;

  productosOrdenados.forEach((product, index) => {
    const numero = index + 1;
    mensaje += `*${numero}.* ${product.nombre}\n`;
  });

  mensaje += `\n0. Volver al menú principal`;

  // Enviamos el mensaje perfectamente formateado
  await sendMessage(phone, mensaje.trim());
}

async function sendProductoSeleccionadoMenu(phone, product) {
  userState[phone] = "in_producto_seleccionado";
  await sendMessage(phone, `

*${product.nombre}* - ${product.descripcion}

¿Qué necesitas saber?

*1.* Cómo aplicar el producto (paso a paso + video)  
*2.* Ficha técnica (PDF)  
*3.* Información general y beneficios  

*0.* Volver al menú de productos
  `.trim());
}

async function sendPreciosMenu(phone) {
  userState[phone] = "in_precios";
  await sendMessage(phone, `
*Precios unitarios*

*1.* Precio de membranas asfálticas
👉 https://drive.google.com/file/d/13zUxLOWV0adFizthyMS-aq90nDFzk_Yj/view

*2.* Precio de aditivos y selladores  
👉 https://drive.google.com/file/d/13zUxLOWV0adFizthyMS-aq90nDFzk_Yj/view

*0.* Volver al menú principal
  `.trim());
}

function getProductById(targetId){
    return products.find(item => item.id.toString() === targetId.toString());
}

async function sendVideo(phone, mediaId, caption = "") {
    if(mediaId === '' || mediaId === null){
        await sendMessage(phone, 
            `Contáctanos a este número https://wa.me/59167978690 para obtener mayor información sobre la aplicación de ${productSelected.nombre}`);
    } else {
        try {
          await axios.post(
            `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: phone,
              type: "video",
              video: {
                id: mediaId,           // ← media_id reutilizable
                caption: caption       // ← texto que aparece arriba del video
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`Video enviado a ${phone}`);
        } catch (error) {
          console.error("Error enviando video:", error.response?.data || error.message);
          await sendMessage(phone, "Hubo un problema al enviar el video. Inténtalo más tarde");
        }
    }
}

async function sendPDF(phone, mediaId, filename, caption = "") {
    if(mediaId === '' || mediaId === null){
        await sendMessage(phone, 
            `Contáctanos a este número https://wa.me/59167978690 para obtener mayor información sobre ${productSelected.nombre}`);
    } else {
        try {
          await axios.post(
            `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: phone,
              type: "document",
              document: {
                id: mediaId,                    // ← media_id reutilizable
                caption: caption,                // ← texto arriba del archivo
                filename: filename               // ← nombre que verá el cliente
              }
            },
            {
              headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
            }
          );
          console.log(`PDF enviado a ${phone}: ${filename}`);
        } catch (error) {
          console.error("Error PDF:", error.response?.data || error.message);
          await sendMessage(phone, "No pude enviar el PDF en este momento. Intenta más tarde");
        }
    }
}

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    const message = body.entry[0].changes[0].value.messages[0];
    const phone = message.from;
    const text = message.text?.body?.trim().toLowerCase() || "";

    console.log(`Mensaje de ${phone}: "${text}" | Estado actual: ${userState[phone] || "ninguno"}`);

    // === SALUDO AUTOMÁTICO (primer mensaje o palabras clave) ===
    const saludos = ["hola", "buenas", "hi", "hello", "menu", "menú", "ayuda", "inicio", "start"];
    if (!userState[phone] || saludos.includes(text)) {
        await sendMainMenu(phone);
        res.sendStatus(200);
        return;
    }

    // ——— ESTADO: Menú principal ———
    if (userState[phone] === "main") {
      if (text === "1") {
        await sendProductosMenu(phone);
      } else if (text === "2") {
        await sendPreciosMenu(phone);
      } else {
        await sendMessage(phone, "Por favor responde solo con 1 o 2");
      }
    }

    // ——— ESTADO: Dentro de Productos ———
    else if (userState[phone] === "in_productos") {
        productSelected = getProductById(text);
        console.log(productSelected);
        if(text === "0"){
            await sendMainMenu(phone);
        } else if(productSelected !== undefined) {
            await sendProductoSeleccionadoMenu(phone, productSelected);
        } else {
            await sendMessage(phone, "Responde con el numero del producto o 0 para volver ");
        }
    }

    // ——— ESTADO: Dentro de producto seleccionado ———
    else if (userState[phone] === "in_producto_seleccionado") {
      if (text === "1") {
        await sendVideo(phone, productSelected.mediaVideo, 'Aquí tienes el video paso a paso de como aplicar '+productSelected.nombre);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendProductoSeleccionadoMenu(phone, productSelected);
      } else if (text === "2") {
        await sendPDF(phone, productSelected.mediaPdf, 'Ficha Tecnica '+productSelected.nombre, 'Aquí tienes la ficha tecnica de '+productSelected.nombre);
        await sendProductoSeleccionadoMenu(phone, productSelected);
    } else if (text === "3") {
        if(productSelected.linkWeb === ''){
            await sendMessage(phone, 
            `Contáctanos a este número https://wa.me/59167978690 para obtener mayor información sobre ${productSelected.nombre}`);
        } else {
          await sendMessage(phone, 
          `Aquí tienes el link con toda la información de ${productSelected.nombre}
          👉 ${productSelected.linkWeb}`);
        }
        await sendProductoSeleccionadoMenu(phone, productSelected);
      } else if (text === "0") {
        await sendProductosMenu(phone);
      } else {
        await sendMessage(phone, "Responde con 1, 2, 3 o 0 para volver ");
      }
    }

    // ——— ESTADO: Dentro de Precios ———
    else if (userState[phone] === "in_precios") {
      if (text === "0") {
        await sendMainMenu(phone);
      } else {
        await sendMessage(phone, "0 para volver ");
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

/* async function getAIResponse(userMessage) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: userMessage }],
  });
  return completion.choices[0].message.content;
} */

// Send Message Function
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`
        }
      }
    );
    console.log("Message sent to", to);
  } catch (error) {
    console.error("Error sending message:", error.response?.data || error.message);
  }
}

// Send Template Message (e.g. Order Confirmation)
async function sendTemplate(to, templateName, language = "en_US", params = []) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: params.map(text => ({ type: "text", text }))
          }
        ]
      }
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

app.listen(3000, () => {
  console.log('WhatsApp Automation API running on port 3000');
});