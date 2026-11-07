const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require("discord.js");

const axios = require("axios");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
const PORT = process.env.PORT || 3000;

const OWNER_ID = "1254918801569349676";

const ROBUX_EMOJI = "<:Robux:1544739089595506698>";
const ROBLOX_LOGO = "<:RobloxLogo:1551638805834895400>";
const ROBLOX_VERIFIED = "<:robloxverified:1474655226769309829>";
const STATUS_ELIGIBLE = "<a:greenverified:1474611766024470672>";
const STATUS_WAITING = "<:orangealert:1474613707857199274>";
const STATUS_MISSING = "<:redalert:1474613861402284254>";
const TOP_CROWN = "<a:crown:1474660980884766843>";

const DEFAULT_1K_BASE = 6.60;

const DATABASE_FILE = path.join(
    __dirname,
    "grupos_servidores.json"
);

// ============================================================
// CLIENTE DISCORD
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// SERVIDOR WEB PARA RENDER
// ============================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send(
        "🟢 KaamStore BOT está online."
    );
});

app.get("/health", (req, res) => {
    res.json({
        online: true,
        bot: client.user
            ? client.user.tag
            : null,
        time: new Date().toISOString()
    });
});

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `🌐 Servidor web activo en puerto ${PORT}`
        );
    }
);

// ============================================================
// COMPROBAR VARIABLES
// ============================================================

console.log(
    "========================================"
);

console.log(
    "       🛍️ KAAMSTORE BOT"
);

console.log(
    "========================================"
);

if (!TOKEN) {
    console.error(
        "❌ Falta DISCORD_TOKEN."
    );
}

if (!CLIENT_ID) {
    console.error(
        "❌ Falta CLIENT_ID."
    );
}

if (!ENCRYPTION_SECRET) {
    console.error(
        "❌ Falta ENCRYPTION_SECRET."
    );
}

// ============================================================
// BASE DE DATOS
// ============================================================

function cargarDB() {
    if (!fs.existsSync(DATABASE_FILE)) {
        fs.writeFileSync(DATABASE_FILE, "{}", { encoding: "utf8", flag: "wx" });
    }
    try {
        const raw = fs.readFileSync(DATABASE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("La raíz de la base de datos no es un objeto JSON.");
        }
        return parsed;
    } catch (error) {
        console.error("❌ No se pudo leer grupos_servidores.json. Se bloquean escrituras para proteger los datos:", error);
        throw new Error("DATABASE_READ_ERROR");
    }
}

function guardarDB(data) {
    const tempFile = DATABASE_FILE + ".tmp";
    try {
        const contenido = JSON.stringify(data, null, 2);
        fs.writeFileSync(tempFile, contenido, "utf8");
        // La sustitución atómica evita dejar el JSON a medio escribir.
        fs.renameSync(tempFile, DATABASE_FILE);
        return true;
    } catch (error) {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
        console.error("❌ Error guardando la base de datos:", error);
        throw new Error("DATABASE_WRITE_ERROR");
    }
}

// ============================================================
// CIFRADO
// ============================================================

function getEncryptionKey() {

    if (!ENCRYPTION_SECRET) {

        throw new Error(
            "ENCRYPTION_SECRET_MISSING"
        );
    }

    return crypto
        .createHash("sha256")
        .update(ENCRYPTION_SECRET)
        .digest();
}

function cifrar(texto) {

    const key =
        getEncryptionKey();

    const iv =
        crypto.randomBytes(16);

    const cipher =
        crypto.createCipheriv(
            "aes-256-cbc",
            key,
            iv
        );

    let encrypted =
        cipher.update(
            texto,
            "utf8",
            "hex"
        );

    encrypted +=
        cipher.final(
            "hex"
        );

    return (
        iv.toString("hex") +
        ":" +
        encrypted
    );
}

function descifrar(texto) {

    const key =
        getEncryptionKey();

    const partes =
        texto.split(":");

    if (
        partes.length !== 2
    ) {

        throw new Error(
            "INVALID_ENCRYPTED_KEY"
        );
    }

    const iv =
        Buffer.from(
            partes[0],
            "hex"
        );

    const decipher =
        crypto.createDecipheriv(
            "aes-256-cbc",
            key,
            iv
        );

    let decrypted =
        decipher.update(
            partes[1],
            "hex",
            "utf8"
        );

    decrypted +=
        decipher.final(
            "utf8"
        );

    return decrypted;
}

// ============================================================
// OWNER
// ============================================================

function esOwner(interaction) {

    return (
        interaction.user.id ===
        OWNER_ID
    );
}

// ============================================================
// GROUP ID
// ============================================================

function extraerGroupId(input) {

    if (!input) {
        return null;
    }

    const texto =
        input.trim();

    if (
        /^\d+$/.test(texto)
    ) {

        return texto;
    }

    const match =
        texto.match(
            /groups\/(\d+)/i
        );

    if (match) {
        return match[1];
    }

    const numero =
        texto.match(/\d+/);

    return numero
        ? numero[0]
        : null;
}

// ============================================================
// PETICIONES ROBLOX CON REINTENTOS PARA 429 / 503
// ============================================================
async function robloxRequest(method, url, config = {}) {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await axios({ method, url, timeout: 15000, ...config });
        } catch (error) {
            const status = error.response?.status;
            if (![429, 503].includes(status) || attempt === maxAttempts) throw error;
            const retryHeader = Number(error.response?.headers?.["retry-after"]);
            const waitMs = Number.isFinite(retryHeader) && retryHeader > 0
                ? Math.min(retryHeader * 1000, 30000)
                : Math.min(1000 * (2 ** (attempt - 1)), 15000);
            console.warn(`⚠️ Roblox respondió ${status}; reintento ${attempt}/${maxAttempts} en ${waitMs}ms.`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
}

// ============================================================
// ROBLOX USER ID
// ============================================================

async function obtenerUserId(input) {

    const texto =
        input.trim();

    if (
        /^\d+$/.test(texto)
    ) {

        return texto;
    }

    const urlMatch =
        texto.match(
            /roblox\.com\/users\/(\d+)/i
        );

    if (urlMatch) {
        return urlMatch[1];
    }

    try {

        const response = await robloxRequest(
            "post",
            "https://users.roblox.com/v1/usernames/users",
            {
                data: {
                    usernames: [texto],
                    excludeBannedUsers: true
                },
                timeout: 10000,
                headers: { "Content-Type": "application/json" }
            }
        );

        const usuarios =
            response.data?.data || [];

        if (
            usuarios.length === 0
        ) {

            return null;
        }

        return usuarios[0].id.toString();

    } catch (error) {

        console.error(
            "❌ Error buscando usuario:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// ============================================================
// ROBLOX PUBLIC API - NO REQUIERE API KEY
// ============================================================

async function obtenerGrupoPublico(groupId) {
    const response = await robloxRequest(
        "get",
        `https://groups.roblox.com/v1/groups/${groupId}`,
        { timeout: 15000 }
    );
    return response.data;
}

async function obtenerGruposUsuarioPublicos(userId) {
    const response = await robloxRequest(
        "get",
        `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
        { timeout: 15000 }
    );
    return response.data?.data || [];
}

// ============================================================
// ROBLOX OPEN CLOUD - GRUPO Y MEMBRESÍA
// La API Key se guarda cifrada por servidor en la base de datos.
// ============================================================

async function obtenerGrupoOpenCloud(groupId, apiKey) {
    try {
        const response = await robloxRequest(
            "get",
            `https://apis.roblox.com/cloud/v2/groups/${groupId}`,
            {
                headers: {
                    "x-api-key": apiKey,
                    "Accept": "application/json"
                },
                timeout: 15000
            }
        );
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        if (status === 401) throw new Error("API_KEY_INVALID");
        if (status === 403) throw new Error("API_KEY_FORBIDDEN");
        if (status === 404) throw new Error("GROUP_NOT_FOUND");
        if (status === 429) throw new Error("ROBLOX_RATE_LIMIT");
        throw error;
    }
}

async function obtenerMembresiaOpenCloud(groupId, userId, apiKey) {
    try {
        const response = await robloxRequest(
            "get",
            `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships`,
            {
                params: {
                    maxPageSize: 10,
                    filter: `user == 'users/${userId}'`
                },
                headers: {
                    "x-api-key": apiKey,
                    "Accept": "application/json"
                },
                timeout: 15000
            }
        );
        return (response.data?.groupMemberships || [])[0] || null;
    } catch (error) {
        const status = error.response?.status;
        if (status === 401) throw new Error("API_KEY_INVALID");
        if (status === 403) throw new Error("API_KEY_FORBIDDEN");
        if (status === 404) throw new Error("GROUP_NOT_FOUND");
        if (status === 429) throw new Error("ROBLOX_RATE_LIMIT");
        throw error;
    }
}

function obtenerApiKeyServidor(db, guildId) {
    const cifrada = db[guildId]?.robloxApiKey;
    if (!cifrada) return null;
    return descifrar(cifrada);
}

// ============================================================
// CALCULAR DÍAS
// ============================================================

function calcularDias(createTime) {

    if (!createTime) {
        return null;
    }

    const fecha =
        new Date(createTime);

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {

        return null;
    }

    return Math.max(
        0,
        Math.floor(
            (
                Date.now() -
                fecha.getTime()
            ) /
            86400000
        )
    );
}

// ============================================================
// RESULTADO DE GRUPO (MEMBRESÍA PÚBLICA)
// ============================================================

function crearResultado(grupo, config, membership) {
    const groupId = String(grupo.id || config.groupId);
    const nombre = grupo.displayName || grupo.name || config.name || `Grupo ${groupId}`;
    const link = `https://www.roblox.com/groups/${groupId}`;
    const insigniaGrupo = grupo.hasVerifiedBadge ? ROBLOX_VERIFIED : ROBLOX_LOGO;
    const requerido = Number(config.dias || (config.verificado ? 3 : 15));

    if (!membership) {
        return {
            groupId, nombre, link, insigniaGrupo,
            unido: false, dias: null, requerido,
            elegible: false, pendiente: false,
            icono: STATUS_MISSING,
            texto: "No pertenece al grupo"
        };
    }

    const fechaUnion = membership.createTime || null;
    const dias = calcularDias(fechaUnion);
    const roleName = membership.role?.name;

    if (dias === null) {
        return {
            groupId, nombre, link, insigniaGrupo,
            unido: true, dias: null, requerido,
            fechaUnion, elegible: false, pendiente: true,
            icono: STATUS_WAITING,
            texto: `Miembro${roleName ? ` · Rango: ${roleName}` : ""} · No se pudo leer la fecha de ingreso`
        };
    }

    if (dias >= requerido) {
        return {
            groupId, nombre, link, insigniaGrupo,
            unido: true, dias, requerido,
            fechaUnion, elegible: true, pendiente: false,
            icono: STATUS_ELIGIBLE,
            texto: `Cumple ${dias}/${requerido} días${roleName ? ` · Rango: ${roleName}` : ""}`
        };
    }

    return {
        groupId, nombre, link, insigniaGrupo,
        unido: true, dias, requerido,
        fechaUnion, elegible: false, pendiente: true,
        icono: STATUS_WAITING,
        texto: `Lleva ${dias}/${requerido} días · Le faltan ${requerido - dias} días${roleName ? ` · Rango: ${roleName}` : ""}`
    };
}

// ============================================================
// EMBED DE VERIFICACIÓN — DISEÑO RENOVADO
// ============================================================
function crearEmbed(userId, resultados, discordUser, displayName) {
    const total = resultados.length;
    const elegibles = resultados.filter(r => r.elegible).length;
    const pendientes = resultados.filter(r => r.pendiente).length;
    const noUnidos = resultados.filter(r => !r.unido).length;
    const nombreDiscord = displayName || discordUser?.globalName || discordUser?.username || "Usuario";
    const avatar = discordUser?.displayAvatarURL({ extension: "png", size: 256 });

    const renderGrupo = r => `${r.icono} ${r.insigniaGrupo || ROBLOX_LOGO} **[${r.nombre}](${r.link})**\n> ${r.texto}`;
    const listaElegibles = resultados.filter(r => r.elegible).map(renderGrupo);
    const listaPendientes = resultados.filter(r => r.pendiente).map(renderGrupo);
    const listaNoUnidos = resultados.filter(r => !r.unido).map(renderGrupo);

    const descripcion = [
        `👤 **${nombreDiscord}** · @${discordUser?.username || "usuario"}`,
        `🆔 Discord: \`${discordUser?.id || "—"}\`  •  Roblox: \`${userId}\``,
        `[🌐 Abrir perfil de Roblox](https://www.roblox.com/users/${userId}/profile)`
    ].join("\n");

    const embed = new EmbedBuilder()
        .setColor(elegibles === total ? 0x2ECC71 : (pendientes > 0 ? 0xF1C40F : 0x5865F2))
        .setTitle("🔎 VERIFICACIÓN DE GRUPOS ROBLOX")
        .setDescription(descripcion)
        .addFields({
            name: "📊 RESUMEN DE VERIFICACIÓN",
            value: `${STATUS_ELIGIBLE} **${elegibles}** elegibles   ${STATUS_WAITING} **${pendientes}** en espera   ${STATUS_MISSING} **${noUnidos}** sin unirse\n📦 **${total}** grupos configurados`,
            inline: false
        });

    if (listaElegibles.length) embed.addFields({ name: `${STATUS_ELIGIBLE} GRUPOS ELEGIBLES (${listaElegibles.length})`, value: listaElegibles.join("\n\n").slice(0, 1024), inline: false });
    if (listaPendientes.length) embed.addFields({ name: `${STATUS_WAITING} GRUPOS EN ESPERA (${listaPendientes.length})`, value: listaPendientes.join("\n\n").slice(0, 1024), inline: false });
    if (listaNoUnidos.length) embed.addFields({ name: `${STATUS_MISSING} GRUPOS PENDIENTES DE UNIRSE (${listaNoUnidos.length})`, value: listaNoUnidos.join("\n\n").slice(0, 1024), inline: false });
    if (!resultados.length) embed.addFields({ name: "📭 Sin grupos", value: "No hay grupos configurados en este servidor." });

    if (avatar) embed.setThumbnail(avatar);
    embed.setFooter({ text: "KaamStore BOT • Roblox Open Cloud" }).setTimestamp();
    return embed;
}

// ============================================================
// BOTONES
// ============================================================

function crearBotones(
    resultados
) {

    const filas = [];

    let fila =
        new ActionRowBuilder();

    let cantidad = 0;

    for (
        const resultado
        of resultados
    ) {

        if (
            cantidad >= 5
        ) {

            filas.push(
                fila
            );

            fila =
                new ActionRowBuilder();

            cantidad = 0;
        }

        fila.addComponents(

            new ButtonBuilder()

                .setLabel(
                    resultado.nombre.length > 70
                        ? resultado.nombre.substring(
                            0,
                            67
                        ) + "..."
                        : resultado.nombre
                )

                .setURL(
                    resultado.link
                )

                .setStyle(
                    ButtonStyle.Link
                )
        );

        cantidad++;
    }

    if (
        cantidad > 0
    ) {

        filas.push(
            fila
        );
    }

    return filas;
}

// ============================================================
// TUTORIAL
// ============================================================

function crearTutorial() {

    return new EmbedBuilder()

        .setColor(
            0x5865F2
        )

        .setTitle(
            "🔑 Tutorial — KaamStore BOT"
        )

        .setDescription(
            "Configura tu API Key de Roblox una sola vez con `/api`. El bot la guarda cifrada y la reutiliza para todos los grupos de este servidor."
        )

        .addFields(

            {
                name:
                    "1️⃣ Creator Dashboard",

                value:
                    "[Abrir API Keys de Roblox](https://create.roblox.com/dashboard/credentials)"
            },

            {
                name:
                    "2️⃣ Crear API Key",

                value:
                    "Pulsa **Create API Key**."
            },

            {
                name:
                    "3️⃣ Seleccionar Group",

                value:
                    "Configura los permisos relacionados con el grupo."
            },

            {
                name:
                    "4️⃣ Permisos",

                value:
                    "Guarda primero la API Key con `/api` y después añade cada grupo por su ID."
            },

            {
                name:
                    "5️⃣ Añadir grupo",

                value:
                    "1. Ejecuta `/api` y pega la clave en el formulario privado.\n2. Usa `/addgroup` con el ID y el estado de verificación."
            },

            {
                name:
                    "⭐ Requisitos",

                value:
                    "🟢 Verificado → **3 días**\n" +
                    "🔴 No verificado → **15 días**"
            },

            {
                name:
                    "⚠️ Seguridad",

                value:
                    "La API Key se almacena cifrada. No la compartas ni la publiques."
            }
        )

        .setFooter({

            text:
                "KaamStore BOT"
        })

        .setTimestamp();
}

// ============================================================
// CONFIG KAAMSTORE
// ============================================================

function obtenerConfigKaamStore(
    db,
    guildId
) {

    if (
        !db[guildId]
    ) {

        db[guildId] = {};
    }

    if (
        !db[guildId].kaamstore
    ) {

        db[guildId].kaamstore = {

            canalAutovouch:
                null,

            canalComandos:
                null,

            roles: {

                role1k:
                    null,

                role10k:
                    null,

                role100k:
                    null,

                role500k:
                    null,

                role1m:
                    null
            },

            precio1k:
                DEFAULT_1K_BASE,

            usuarios: {}
        };
    }

    const config =
        db[guildId].kaamstore;

    if (!config.roles) {
        config.roles = {};
    }

    if (!config.usuarios) {
        config.usuarios = {};
    }

    if (
        typeof config.precio1k !==
        "number"
    ) {

        config.precio1k =
            DEFAULT_1K_BASE;
    }

    return config;
}

// ============================================================
// FORMATOS
// ============================================================

function formatearRobux(numero) {

    return Number(
        numero || 0
    ).toLocaleString(
        "en-US"
    );
}

function formatearUSD(numero) {

    return Number(
        numero || 0
    ).toFixed(2);
}

// ============================================================
// CALCULAR PRECIO
// ============================================================

function calcularPrecio(
    cantidad,
    precio1k
) {

    return (
        Number(cantidad) /
        1000
    ) *
    Number(precio1k);
}

// ============================================================
// REFERENCIA
// ============================================================

function crearReferencia() {

    const caracteres =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let codigo = "";

    for (
        let i = 0;
        i < 7;
        i++
    ) {

        codigo +=
            caracteres[
                Math.floor(
                    Math.random() *
                    caracteres.length
                )
            ];
    }

    return `KSG-${codigo}`;
}

// ============================================================
// RANGOS
// ============================================================

function obtenerRango(
    robux
) {

    const cantidad =
        Number(
            robux || 0
        );

    if (
        cantidad >= 1000000
    ) {

        return {

            nombre:
                "1M Buyer",

            nivel:
                5,

            clave:
                "role1m"
        };
    }

    if (
        cantidad >= 500000
    ) {

        return {

            nombre:
                "500K Buyer",

            nivel:
                4,

            clave:
                "role500k"
        };
    }

    if (
        cantidad >= 100000
    ) {

        return {

            nombre:
                "100K Buyer",

            nivel:
                3,

            clave:
                "role100k"
        };
    }

    if (
        cantidad >= 10000
    ) {

        return {

            nombre:
                "10K Buyer",

            nivel:
                2,

            clave:
                "role10k"
        };
    }

    if (
        cantidad >= 1000
    ) {

        return {

            nombre:
                "1K Buyer",

            nivel:
                1,

            clave:
                "role1k"
        };
    }

    return {

        nombre:
            "Buyer",

        nivel:
            0,

        clave:
            null
    };
}

// ============================================================
// ROLES AUTOMÁTICOS
// ============================================================

async function actualizarRoles(
    guild,
    userId,
    robux,
    config
) {

    try {

        const miembro =
            await guild.members.fetch(
                userId
            );

        if (!miembro) {
            return;
        }

        const rango =
            obtenerRango(
                robux
            );

        const rolesConfigurados = [

            config.roles.role1k,

            config.roles.role10k,

            config.roles.role100k,

            config.roles.role500k,

            config.roles.role1m

        ].filter(Boolean);

        // Quitar todos los rangos anteriores
        for (
            const roleId
            of rolesConfigurados
        ) {

            if (
                miembro.roles.cache.has(
                    roleId
                )
            ) {

                try {

                    await miembro.roles.remove(
                        roleId
                    );

                } catch (error) {

                    console.error(
                        `❌ No pude quitar el rol ${roleId}:`,
                        error.message
                    );
                }
            }
        }

        // Añadir el rango correspondiente
        if (
            rango.clave
        ) {

            const roleId =
                config.roles[
                    rango.clave
                ];

            if (
                roleId
            ) {

                const role =
                    guild.roles.cache.get(
                        roleId
                    );

                if (!role) {

                    console.log(
                        `⚠️ No existe el rol ${roleId}.`
                    );

                    return;
                }

                try {

                    await miembro.roles.add(
                        role
                    );

                    console.log(
                        `🏆 ${role.name} añadido a ${miembro.user.tag}`
                    );

                } catch (error) {

                    console.error(
                        "❌ Error añadiendo rol:",
                        error.message
                    );
                }
            }
        }

    } catch (error) {

        console.error(
            "❌ Error actualizando roles:",
            error
        );
    }
}

// ============================================================
// AUTOVOUCH
// ============================================================

async function enviarAutovouch(
    guild,
    config,
    usuario,
    compra
) {

    if (
        !config.canalAutovouch
    ) {

        console.log(
            "⚠️ No hay canal de autovouch configurado."
        );

        return;
    }

    const canal =
        guild.channels.cache.get(
            config.canalAutovouch
        );

    if (!canal) {

        console.log(
            "⚠️ Canal de autovouch no encontrado."
        );

        return;
    }

    const rango =
        obtenerRango(
            compra.robuxTotales
        );

    const embed =
        new EmbedBuilder()

            .setColor(
                0xFF4D5A
            )

            .setTitle(
                "🛍️ ¡Nueva compra registrada!"
            )

            .setThumbnail(
                usuario.displayAvatarURL({
                    dynamic: true,
                    size: 256
                })
            )

            .setDescription(
                `**${usuario.username}** ha realizado una compra en **KaamStore**.`
            )

            .addFields(

                {
                    name:
                        "👤 Cliente",

                    value:
                        `${usuario}`,

                    inline:
                        true
                },

                {
                    name:
                        "🧾 Referencia",

                    value:
                        `\`${compra.referencia}\``,

                    inline:
                        true
                },

                {
                    name:
                        "🛒 Compra",

                    value:
                        `${ROBUX_EMOJI} **${formatearRobux(compra.cantidad)} Robux**`,

                    inline:
                        true
                },

                {
                    name:
                        "💵 Precio",

                    value:
                        `**$${formatearUSD(compra.precio)} USD**`,

                    inline:
                        true
                },

                {
                    name:
                        `${ROBUX_EMOJI} Total comprado`,

                    value:
                        `**${formatearRobux(compra.robuxTotales)} Robux**`,

                    inline:
                        true
                },

                {
                    name:
                        "🏆 Rango",

                    value:
                        `**${rango.nombre}**`,

                    inline:
                        true
                }
            )

            .setFooter({

                text:
                    "KaamStore • Autovouch"
            })

            .setTimestamp();

    try {

        await canal.send({

            embeds: [
                embed
            ]
        });

        console.log(
            `🧾 Autovouch enviado para ${usuario.tag}`
        );

    } catch (error) {

        console.error(
            "❌ Error enviando autovouch:",
            error
        );
    }
}

// ============================================================
// PERFIL
// ============================================================

function crearPerfilEmbed(
    usuario,
    datos,
    precioBase
) {

    const robux =
        Number(
            datos?.robuxTotales || 0
        );

    const gastado =
        Number(
            datos?.dineroGastado || 0
        );

    const compras =
        Number(
            datos?.compras || 0
        );

    const rango =
        obtenerRango(
            robux
        );

    return new EmbedBuilder()

        .setColor(
            0xFF4D5A
        )

        .setTitle(
            `🛍️ Perfil de ${usuario.username}`
        )

        .setThumbnail(
            usuario.displayAvatarURL({
                dynamic: true,
                size: 256
            })
        )

        .setDescription(
            `Estadísticas públicas de compras en **KaamStore**.`
        )

        .addFields(

            {
                name:
                    "🏆 Rango",

                value:
                    `**${rango.nombre}**`,

                inline:
                    true
            },

            {
                name:
                    `${ROBUX_EMOJI} Robux totales`,

                value:
                    `**${formatearRobux(robux)}**`,

                inline:
                    true
            },

            {
                name:
                    "🛍️ Compras",

                value:
                    `**${compras}**`,

                inline:
                    true
            },

            {
                name:
                    "💵 Dinero gastado",

                value:
                    `**$${formatearUSD(gastado)} USD**`,

                inline:
                    true
            },

            {
                name:
                    "💰 Precio actual",

                value:
                    `${ROBUX_EMOJI} 1K = **$${formatearUSD(precioBase)} USD**`,

                inline:
                    true
            },

            {
                name:
                    "🆔 Discord",

                value:
                    `\`${usuario.id}\``,

                inline:
                    true
            }
        )

        .setFooter({

            text:
                "KaamStore • Perfil público"
        })

        .setTimestamp();
}

// ============================================================
// PERFIL SIN COMPRAS
// ============================================================

function crearSinComprasEmbed(
    usuario
) {

    return new EmbedBuilder()

        .setColor(
            0xFEE75C
        )

        .setTitle(
            `🛍️ Perfil de ${usuario.username}`
        )

        .setThumbnail(
            usuario.displayAvatarURL({
                dynamic: true,
                size: 256
            })
        )

        .setDescription(
            `${usuario}\n\n` +
            "⚠️ **No tiene ninguna compra registrada en KaamStore.**"
        )

        .setFooter({

            text:
                "KaamStore • Perfil público"
        })

        .setTimestamp();
}

// ============================================================
// REGISTRO DE COMANDOS
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            `✅ Conectado como ${client.user.tag}`
        );

        const commands = [

            // ------------------------------------------------
            // USER
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "user"
                )

                .setDescription(
                    "Verifica un usuario de Roblox"
                )

                .addStringOption(
                    option =>
                        option

                            .setName(
                                "usuario"
                            )

                            .setDescription(
                                "Username, ID o URL"
                            )

                            .setRequired(
                                true
                            )
                ),

            // ------------------------------------------------
            // API - CONFIGURAR CLAVE UNA SOLA VEZ POR SERVIDOR
            // ------------------------------------------------
            new SlashCommandBuilder()
                .setName("api")
                .setDescription("Configura de forma privada la API Key de Roblox para este servidor"),

            // ------------------------------------------------
            // ADDGROUP - REQUIERE API KEY CONFIGURADA CON /api
            // ------------------------------------------------
            new SlashCommandBuilder()
                .setName("addgroup")
                .setDescription("Añade un grupo de Roblox y define sus días requeridos")
                .addStringOption(option => option
                    .setName("group_id")
                    .setDescription("ID del grupo de Roblox")
                    .setRequired(true)
                )
                .addStringOption(option => option
                    .setName("verificado")
                    .setDescription("¿El grupo está verificado?")
                    .setRequired(true)
                    .addChoices(
                        { name: "Sí — requiere 3 días", value: "si" },
                        { name: "No — requiere 15 días", value: "no" }
                    )
                ),

            // ------------------------------------------------
            // TUTORIAL
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "tutorial"
                )

                .setDescription(
                    "Tutorial para configurar Roblox"
                ),

            // ------------------------------------------------
            // PERFIL
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "perfil"
                )

                .setDescription(
                    "Muestra tu perfil público de KaamStore"
                ),

            // ------------------------------------------------
            // ADDCOMPRA
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "addcompra"
                )

                .setDescription(
                    "Registra una compra de Robux"
                )

                .addUserOption(
                    option =>
                        option

                            .setName(
                                "usuario"
                            )

                            .setDescription(
                                "Cliente"
                            )

                            .setRequired(
                                true
                            )
                )

                .addIntegerOption(
                    option =>
                        option

                            .setName(
                                "cantidad"
                            )

                            .setDescription(
                                "Cantidad de Robux"
                            )

                            .setMinValue(
                                1
                            )

                            .setRequired(
                                true
                            )
                ),

            // ------------------------------------------------
            // CONFIG
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "config"
                )

                .setDescription(
                    "Configura KaamStore"
                )

                .addChannelOption(
                    option =>
                        option

                            .setName(
                                "canal-autovouch"
                            )

                            .setDescription(
                                "Canal de autovouch"
                            )

                            .addChannelTypes(
                                ChannelType.GuildText
                            )

                            .setRequired(
                                true
                            )
                )

                .addChannelOption(
                    option =>
                        option

                            .setName(
                                "canal-comandos"
                            )

                            .setDescription(
                                "Canal donde se usa /perfil"
                            )

                            .addChannelTypes(
                                ChannelType.GuildText
                            )

                            .setRequired(
                                true
                            )
                )

                .addRoleOption(
                    option =>
                        option

                            .setName(
                                "rol-1k"
                            )

                            .setDescription(
                                "Rol al llegar a 1K"
                            )

                            .setRequired(
                                true
                            )
                )

                .addRoleOption(
                    option =>
                        option

                            .setName(
                                "rol-10k"
                            )

                            .setDescription(
                                "Rol al llegar a 10K"
                            )

                            .setRequired(
                                true
                            )
                )

                .addRoleOption(
                    option =>
                        option

                            .setName(
                                "rol-100k"
                            )

                            .setDescription(
                                "Rol al llegar a 100K"
                            )

                            .setRequired(
                                true
                            )
                )

                .addRoleOption(
                    option =>
                        option

                            .setName(
                                "rol-500k"
                            )

                            .setDescription(
                                "Rol al llegar a 500K"
                            )

                            .setRequired(
                                true
                            )
                )

                .addRoleOption(
                    option =>
                        option

                            .setName(
                                "rol-1m"
                            )

                            .setDescription(
                                "Rol al llegar a 1M"
                            )

                            .setRequired(
                                true
                            )
                ),

            // ------------------------------------------------
            // 1KBASE
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "1kbase"
                )

                .setDescription(
                    "Cambia el precio de 1K Robux"
                )

                .addNumberOption(
                    option =>
                        option

                            .setName(
                                "base"
                            )

                            .setDescription(
                                "Ejemplo: 7.50"
                            )

                            .setMinValue(
                                0.01
                            )

                            .setRequired(
                                true
                            )
                )

            ,
            new SlashCommandBuilder()
                .setName("top")
                .setDescription("Muestra el top 10 de compradores de KaamStore"),
            new SlashCommandBuilder()
                .setName("quitarcompra")
                .setDescription("Elimina una compra usando su referencia")
                .addStringOption(option => option.setName("referencia").setDescription("Referencia KSG-XXXXXXX").setRequired(true)),
            new SlashCommandBuilder()
                .setName("delgroup")
                .setDescription("Elimina un grupo de Roblox configurado")
                .addStringOption(option => option.setName("group_id").setDescription("ID o URL del grupo").setRequired(true))

        ].map(
            command =>
                command.toJSON()
        );

        const rest =
            new REST({
                version:
                    "10"
            }).setToken(
                TOKEN
            );

        try {

            // ================================================
            // REGISTRAR GLOBALMENTE
            // ================================================

            await rest.put(

                Routes.applicationCommands(
                    CLIENT_ID
                ),

                {
                    body:
                        commands
                }
            );

            console.log(
                "✅ Comandos globales registrados."
            );

        } catch (error) {

            console.error(
                "❌ Error registrando comandos:",
                error
            );
        }
    }
);

// ============================================================
// INTERACCIONES
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        // ----------------------------------------------------
        // FORMULARIO PRIVADO PARA GUARDAR API KEY
        // ----------------------------------------------------
        if (interaction.isModalSubmit() && interaction.customId === "kaam_api_key_modal") {
            if (!esOwner(interaction)) {
                return interaction.reply({ content: "❌ Solo el Owner puede guardar la API Key.", ephemeral: true });
            }

            const apiKey = interaction.fields.getTextInputValue("roblox_api_key").trim();
            if (apiKey.length < 12 || /\s/.test(apiKey)) {
                return interaction.reply({ content: "❌ La API Key parece inválida. Comprueba que la copiaste completa y sin espacios.", ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            try {
                const db = cargarDB();
                const guildId = interaction.guild.id;
                if (!db[guildId]) db[guildId] = {};
                db[guildId].robloxApiKey = cifrar(apiKey);
                db[guildId].robloxApiKeyUpdatedAt = new Date().toISOString();
                guardarDB(db);
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle("🔐 API Key guardada correctamente")
                        .setDescription("La API Key quedó almacenada **cifrada** para este servidor. No tendrás que introducirla al añadir cada grupo.")
                        .addFields(
                            { name: "🔑 Estado", value: "Configurada · Oculta", inline: true },
                            { name: "🏠 Alcance", value: "Solo este servidor", inline: true },
                            { name: "➡️ Siguiente paso", value: "Usa `/addgroup` con el ID y el estado de verificación." }
                        )
                        .setFooter({ text: "KaamStore BOT • Roblox Open Cloud" })
                        .setTimestamp()]
                });
            } catch (error) {
                console.error("❌ ERROR GUARDANDO API KEY:", error);
                return interaction.editReply("❌ No se pudo guardar la API Key. Comprueba que `ENCRYPTION_SECRET` esté configurada en el hosting.");
            }
        }

        if (interaction.isChatInputCommand() && interaction.commandName === "api") {
            if (!esOwner(interaction)) {
                return interaction.reply({ content: "❌ Solo el Owner puede configurar la API Key.", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId("kaam_api_key_modal")
                .setTitle("Configurar API Key de Roblox");
            const apiInput = new TextInputBuilder()
                .setCustomId("roblox_api_key")
                .setLabel("Pega aquí tu API Key")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("API Key de Roblox")
                .setRequired(true)
                .setMinLength(12)
                .setMaxLength(4000);
            modal.addComponents(new ActionRowBuilder().addComponents(apiInput));
            return interaction.showModal(modal);
        }

        if (!interaction.isChatInputCommand()) return;

        // ====================================================
        // TUTORIAL
        // ====================================================

        if (
            interaction.commandName ===
            "tutorial"
        ) {

            if (
                !esOwner(interaction)
            ) {

                return interaction.reply({

                    content:
                        "❌ Solo el Owner puede utilizar este comando.",

                    ephemeral:
                        true
                });
            }

            return interaction.reply({

                embeds: [
                    crearTutorial()
                ],

                ephemeral:
                    true
            });
        }

        // ====================================================
        // ====================================================
        // ADDGROUP - SIN API KEY
        // ====================================================
        // ====================================================
        // ADDGROUP - ID + VERIFICACIÓN (3 O 15 DÍAS)
        // ====================================================
        if (interaction.commandName === "addgroup") {
            if (!esOwner(interaction)) {
                return interaction.reply({
                    content: "❌ Solo el Owner puede utilizar este comando.",
                    ephemeral: true
                });
            }

            const groupInput = interaction.options.getString("group_id", true);
            const groupId = extraerGroupId(groupInput);
            const verificado = interaction.options.getString("verificado", true);
            if (!groupId) {
                return interaction.reply({ content: "❌ Introduce un ID de grupo de Roblox válido.", ephemeral: true });
            }

            const dias = verificado === "si" ? 3 : 15;
            await interaction.deferReply({ ephemeral: true });
            try {
                const db = cargarDB();
                const guildId = interaction.guild.id;
                const apiKey = obtenerApiKeyServidor(db, guildId);
                if (!apiKey) {
                    return interaction.editReply("❌ Primero configura tu API Key con `/api api_key:TU_API_KEY`. Solo tendrás que hacerlo una vez en este servidor.");
                }

                // Esta llamada confirma que la clave tiene acceso al grupo configurado.
                const grupo = await obtenerGrupoOpenCloud(groupId, apiKey);
                const nombre = grupo.displayName || grupo.name || `Grupo ${groupId}`;
                if (!db[guildId]) db[guildId] = {};
                db[guildId][groupId] = {
                    ...(db[guildId][groupId] || {}),
                    groupId,
                    name: nombre,
                    dias,
                    verificado: verificado === "si",
                    metodo: "opencloud",
                    addedBy: interaction.user.id,
                    addedAt: new Date().toISOString()
                };
                guardarDB(db);

                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle("✅ Grupo configurado correctamente")
                        .setDescription(`**${nombre}** quedó añadido y conectado a Roblox Open Cloud.`)
                        .addFields(
                            { name: "🆔 Group ID", value: `\`${groupId}\``, inline: true },
                            { name: "⭐ Verificado", value: verificado === "si" ? "Sí" : "No", inline: true },
                            { name: "⏳ Antigüedad requerida", value: `**${dias} días**`, inline: true },
                            { name: "🔐 API Key", value: "Usando la clave guardada con `/api`", inline: false }
                        )
                        .setURL(`https://www.roblox.com/groups/${groupId}`)
                        .setFooter({ text: "KaamStore BOT • Roblox Open Cloud" })
                        .setTimestamp()]
                });
            } catch (error) {
                console.error("❌ ERROR ADDGROUP:", error.response?.status, error.message);
                const mensajes = {
                    API_KEY_INVALID: "❌ La API Key guardada es inválida. Vuelve a configurarla con `/api`.",
                    API_KEY_FORBIDDEN: "❌ La API Key no tiene permisos para consultar ese grupo. Revisa los permisos de Roblox Open Cloud.",
                    GROUP_NOT_FOUND: "❌ No encontré ese grupo. Comprueba el ID.",
                    ROBLOX_RATE_LIMIT: "⏳ Roblox está limitando las consultas. Inténtalo más tarde."
                };
                return interaction.editReply(mensajes[error.message] || "❌ No se pudo consultar el grupo en Roblox. Revisa los permisos de la API Key e inténtalo de nuevo.");
            }
        }

        // USER
        // ====================================================

        if (
            interaction.commandName ===
            "user"
        ) {

            await interaction.deferReply();

            const input =
                interaction.options.getString(
                    "usuario"
                );

            try {

                const userId =
                    await obtenerUserId(
                        input
                    );

                if (!userId) {

                    return interaction.editReply(
                        "❌ No encontré ese usuario de Roblox."
                    );
                }

                const db =
                    cargarDB();

                const guildId =
                    interaction.guild.id;

                const grupos =
                    db[guildId] || {};

                const groupIds =
                    Object.keys(grupos).filter(
                        id => !["kaamstore", "robloxApiKey", "robloxApiKeyUpdatedAt"].includes(id)
                    );

                if (
                    groupIds.length === 0
                ) {

                    return interaction.editReply(
                        "⚠️ No hay grupos configurados. Usa `/addgroup`."
                    );
                }

                const apiKey = obtenerApiKeyServidor(db, guildId);
                if (!apiKey) {
                    return interaction.editReply("❌ Este servidor todavía no tiene una API Key configurada. El Owner debe utilizar `/api`.");
                }

                const resultados = [];
                for (const groupId of groupIds) {
                    const config = grupos[groupId] || {};
                    try {
                        const [grupo, membership] = await Promise.all([
                            obtenerGrupoOpenCloud(groupId, apiKey),
                            obtenerMembresiaOpenCloud(groupId, userId, apiKey)
                        ]);
                        resultados.push(crearResultado(grupo, config, membership));
                    } catch (error) {
                        console.error(`❌ Error verificando grupo ${groupId}:`, error.response?.status || error.message);
                        const nombre = config.name || `Grupo ${groupId}`;
                        resultados.push({
                            groupId,
                            nombre,
                            link: `https://www.roblox.com/groups/${groupId}`,
                            insigniaGrupo: ROBLOX_LOGO,
                            unido: false,
                            dias: null,
                            requerido: Number(config.dias || (config.verificado ? 3 : 15)),
                            elegible: false,
                            pendiente: true,
                            icono: STATUS_WAITING,
                            texto: error.message === "API_KEY_FORBIDDEN"
                                ? "La API Key no tiene permisos para consultar este grupo"
                                : "No se pudo consultar este grupo en Roblox"
                        });
                    }
                }

                return interaction.editReply({

                    embeds: [

                        crearEmbed(
                            userId,
                            resultados,
                            interaction.user,
                            interaction.member?.displayName || interaction.user.globalName || interaction.user.username
                        )
                    ],

                    components:
                        crearBotones(
                            resultados
                        )
                });

            } catch (error) {

                console.error(
                    "❌ ERROR USER:",
                    error
                );

                return interaction.editReply(
                    "❌ Ocurrió un error realizando la verificación."
                );
            }
        }

        // ====================================================
        // CONFIG
        // ====================================================

        if (
            interaction.commandName ===
            "config"
        ) {

            if (
                !esOwner(interaction)
            ) {

                return interaction.reply({

                    content:
                        "❌ Solo el Owner puede utilizar este comando.",

                    ephemeral:
                        true
                });
            }

            const canalAutovouch =
                interaction.options.getChannel(
                    "canal-autovouch"
                );

            const canalComandos =
                interaction.options.getChannel(
                    "canal-comandos"
                );

            const rol1k =
                interaction.options.getRole(
                    "rol-1k"
                );

            const rol10k =
                interaction.options.getRole(
                    "rol-10k"
                );

            const rol100k =
                interaction.options.getRole(
                    "rol-100k"
                );

            const rol500k =
                interaction.options.getRole(
                    "rol-500k"
                );

            const rol1m =
                interaction.options.getRole(
                    "rol-1m"
                );

            const db =
                cargarDB();

            const guildId =
                interaction.guild.id;

            const config =
                obtenerConfigKaamStore(
                    db,
                    guildId
                );

            config.canalAutovouch =
                canalAutovouch.id;

            config.canalComandos =
                canalComandos.id;

            config.roles.role1k =
                rol1k.id;

            config.roles.role10k =
                rol10k.id;

            config.roles.role100k =
                rol100k.id;

            config.roles.role500k =
                rol500k.id;

            config.roles.role1m =
                rol1m.id;

            guardarDB(
                db
            );

            return interaction.reply({

                embeds: [

                    new EmbedBuilder()

                        .setColor(
                            0x57F287
                        )

                        .setTitle(
                            "⚙️ KaamStore configurado"
                        )

                        .setDescription(
                            "La configuración del sistema fue guardada correctamente."
                        )

                        .addFields(

                            {
                                name:
                                    "🧾 Autovouch",

                                value:
                                    `${canalAutovouch}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "💬 Comandos",

                                value:
                                    `${canalComandos}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    `${ROBUX_EMOJI} 1K`,

                                value:
                                    `${rol1k}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    `${ROBUX_EMOJI} 10K`,

                                value:
                                    `${rol10k}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    `${ROBUX_EMOJI} 100K`,

                                value:
                                    `${rol100k}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    `${ROBUX_EMOJI} 500K`,

                                value:
                                    `${rol500k}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    `${ROBUX_EMOJI} 1M`,

                                value:
                                    `${rol1m}`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "💰 Precio base",

                                value:
                                    `1K = **$${formatearUSD(config.precio1k)} USD**`
                            }
                        )

                        .setFooter({

                            text:
                                "KaamStore BOT"
                        })

                        .setTimestamp()
                ],

                ephemeral:
                    true
            });
        }

        // ====================================================
        // 1KBASE
        // ====================================================

        if (
            interaction.commandName ===
            "1kbase"
        ) {

            if (
                !esOwner(interaction)
            ) {

                return interaction.reply({

                    content:
                        "❌ Solo el Owner puede utilizar este comando.",

                    ephemeral:
                        true
                });
            }

            const nuevoPrecio =
                interaction.options.getNumber(
                    "base"
                );

            const db =
                cargarDB();

            const guildId =
                interaction.guild.id;

            const config =
                obtenerConfigKaamStore(
                    db,
                    guildId
                );

            const anterior =
                config.precio1k;

            config.precio1k =
                Number(
                    nuevoPrecio.toFixed(2)
                );

            guardarDB(
                db
            );

            return interaction.reply({

                embeds: [

                    new EmbedBuilder()

                        .setColor(
                            0x57F287
                        )

                        .setTitle(
                            "💰 Precio actualizado"
                        )

                        .setDescription(
                            "El precio base de KaamStore ha sido cambiado correctamente."
                        )

                        .addFields(

                            {
                                name:
                                    "Anterior",

                                value:
                                    `1K = **$${formatearUSD(anterior)} USD**`,

                                inline:
                                    true
                            },

                            {
                                name:
                                    "Nuevo",

                                value:
                                    `1K = **$${formatearUSD(config.precio1k)} USD**`,

                                inline:
                                    true
                            }
                        )

                        .setFooter({

                            text:
                                "Las compras anteriores mantienen su precio original."
                        })

                        .setTimestamp()
                ],

                ephemeral:
                    true
            });
        }

        // ====================================================
        // PERFIL
        // ====================================================

        if (
            interaction.commandName ===
            "perfil"
        ) {

            const db =
                cargarDB();

            const guildId =
                interaction.guild.id;

            const config =
                obtenerConfigKaamStore(
                    db,
                    guildId
                );

            // -----------------------------------------------
            // SOLO EN CANAL CONFIGURADO
            // -----------------------------------------------

            if (
                config.canalComandos &&
                interaction.channel.id !==
                config.canalComandos
            ) {

                const canal =
                    interaction.guild.channels.cache.get(
                        config.canalComandos
                    );

                return interaction.reply({

                    content:
                        canal
                            ? `❌ El comando \`/perfil\` solamente puede utilizarse en ${canal}.`
                            : "❌ Este comando solamente puede utilizarse en el canal configurado.",

                    ephemeral:
                        true
                });
            }

            const userId =
                interaction.user.id;

            const datos =
                config.usuarios[
                    userId
                ];

            // -----------------------------------------------
            // SIN COMPRAS
            // -----------------------------------------------

            if (
                !datos ||
                Number(
                    datos.robuxTotales || 0
                ) <= 0
            ) {

                // IMPORTANTE:
                // NO ephemeral.
                // El perfil será público.

                return interaction.reply({

                    embeds: [

                        crearSinComprasEmbed(
                            interaction.user
                        )
                    ]
                });
            }

            // -----------------------------------------------
            // CON COMPRAS
            // -----------------------------------------------

            // IMPORTANTE:
            // NO ephemeral.
            // Todo el servidor puede verlo.

            return interaction.reply({

                embeds: [

                    crearPerfilEmbed(
                        interaction.user,
                        datos,
                        config.precio1k
                    )
                ]
            });
        }

        // ====================================================
        // ADDCOMPRA
        // ====================================================

        if (
            interaction.commandName ===
            "addcompra"
        ) {

            if (
                !esOwner(interaction)
            ) {

                return interaction.reply({

                    content:
                        "❌ Solo el Owner puede utilizar este comando.",

                    ephemeral:
                        true
                });
            }

            const usuario =
                interaction.options.getUser(
                    "usuario"
                );

            const cantidad =
                interaction.options.getInteger(
                    "cantidad"
                );

            if (
                cantidad <= 0
            ) {

                return interaction.reply({

                    content:
                        "❌ La cantidad debe ser mayor a 0.",

                    ephemeral:
                        true
                });
            }

            await interaction.deferReply({
                ephemeral:
                    true
            });

            try {

                const db =
                    cargarDB();

                const guildId =
                    interaction.guild.id;

                const config =
                    obtenerConfigKaamStore(
                        db,
                        guildId
                    );

                // --------------------------------------------
                // CREAR USUARIO
                // --------------------------------------------

                if (
                    !config.usuarios[
                        usuario.id
                    ]
                ) {

                    config.usuarios[
                        usuario.id
                    ] = {

                        robuxTotales:
                            0,

                        dineroGastado:
                            0,

                        compras:
                            0,

                        historial:
                            []
                    };
                }

                const datos =
                    config.usuarios[
                        usuario.id
                    ];

                // --------------------------------------------
                // PRECIO
                // --------------------------------------------

                const precio =
                    calcularPrecio(
                        cantidad,
                        config.precio1k
                    );

                // --------------------------------------------
                // ACTUALIZAR TOTALES
                // --------------------------------------------

                datos.robuxTotales =
                    Number(
                        datos.robuxTotales || 0
                    ) +
                    cantidad;

                datos.dineroGastado =
                    Number(
                        datos.dineroGastado || 0
                    ) +
                    precio;

                datos.compras =
                    Number(
                        datos.compras || 0
                    ) +
                    1;

                // --------------------------------------------
                // REFERENCIA
                // --------------------------------------------

                const referencia =
                    crearReferencia();

                const compra = {

                    referencia,

                    cantidad,

                    precio:
                        Number(
                            precio.toFixed(2)
                        ),

                    precioBase:
                        Number(
                            config.precio1k.toFixed(2)
                        ),

                    robuxTotales:
                        datos.robuxTotales,

                    dineroGastado:
                        Number(
                            datos.dineroGastado.toFixed(2)
                        ),

                    fecha:
                        new Date()
                            .toISOString(),

                    agregadoPor:
                        interaction.user.id
                };

                // --------------------------------------------
                // HISTORIAL
                // --------------------------------------------

                if (
                    !Array.isArray(
                        datos.historial
                    )
                ) {

                    datos.historial =
                        [];
                }

                datos.historial.push(
                    compra
                );

                guardarDB(
                    db
                );

                // --------------------------------------------
                // ROLES
                // --------------------------------------------

                await actualizarRoles(

                    interaction.guild,

                    usuario.id,

                    datos.robuxTotales,

                    config
                );

                // --------------------------------------------
                // AUTOVOUCH
                // --------------------------------------------

                await enviarAutovouch(

                    interaction.guild,

                    config,

                    usuario,

                    compra
                );

                const rango =
                    obtenerRango(
                        datos.robuxTotales
                    );

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0x57F287
                            )

                            .setTitle(
                                "✅ Compra registrada"
                            )

                            .setDescription(
                                `La compra de ${usuario} fue registrada correctamente en **KaamStore**.`
                            )

                            .addFields(

                                {
                                    name:
                                        "👤 Cliente",

                                    value:
                                        `${usuario}`,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "🧾 Referencia",

                                    value:
                                        `\`${referencia}\``,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "🛒 Compra",

                                    value:
                                        `${ROBUX_EMOJI} **${formatearRobux(cantidad)} Robux**`,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "💵 Precio",

                                    value:
                                        `**$${formatearUSD(precio)} USD**`,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        `${ROBUX_EMOJI} Total`,

                                    value:
                                        `**${formatearRobux(datos.robuxTotales)} Robux**`,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "🏆 Rango",

                                    value:
                                        `**${rango.nombre}**`,

                                    inline:
                                        true
                                }
                            )

                            .setFooter({

                                text:
                                    "KaamStore • Compra registrada"
                            })

                            .setTimestamp()
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ ERROR ADDCOMPRA:",
                    error
                );

                return interaction.editReply(
                    "❌ Ocurrió un error registrando la compra."
                );
            }
        }

        // ====================================================
        // TOP 10 COMPRADORES
        // ====================================================
        if (interaction.commandName === "top") {
            await interaction.deferReply();
            try {
                const db = cargarDB();
                const config = obtenerConfigKaamStore(db, interaction.guild.id);
                const ranking = Object.entries(config.usuarios || {})
                    .map(([id, u]) => ({ id, robux: Number(u.robuxTotales || 0), gasto: Number(u.dineroGastado || 0), compras: Number(u.compras || 0) }))
                    .filter(u => Number.isFinite(u.robux) && u.robux > 0)
                    .sort((a, b) => b.robux - a.robux || b.gasto - a.gasto)
                    .slice(0, 10);

                if (!ranking.length) {
                    return interaction.editReply({ content: "📭 **Todavía no hay compras registradas.**\n\n¡Sé el primero en aparecer en el ranking de KaamStore!" });
                }

                const medallas = [TOP_CROWN, "🥈", "🥉"];
                const filas = await Promise.all(ranking.map(async (u, i) => {
                    let user = null;
                    try { user = await client.users.fetch(u.id); } catch (_) {}
                    const nombre = user ? (user.globalName || user.username) : `Usuario ${u.id}`;
                    const puesto = medallas[i] || `**#${i + 1}**`;
                    const perfil = `<@${u.id}>`;
                    return `${puesto} **${perfil}** · ${nombre}\n> ${ROBUX_EMOJI} **${formatearRobux(u.robux)} Robux**  •  💵 **$${formatearUSD(u.gasto)} USD**\n> 🛍️ ${u.compras} compra(s)`;
                }));

                const embed = new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("🏆 TOP 10 · KAAMSTORE")
                    .setDescription(`✨ **Los compradores más destacados de este servidor**\n\n${filas.join("\n\n━━━━━━━━━━━━━━━━━━\n\n")}`)
                    .addFields({ name: "📈 Estadísticas del ranking", value: `👥 **${ranking.length}** comprador(es) en el Top 10\n🥇 Ordenado por Robux comprados · 💰 Importes acumulados`, inline: false })
                    .setFooter({ text: `KaamStore BOT • Ranking solicitado por ${interaction.user.username}` })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error("❌ ERROR TOP:", error);
                return interaction.editReply({ content: "❌ No pude generar el ranking. Inténtalo de nuevo." });
            }
        }

        // ====================================================
        // QUITAR COMPRA POR REFERENCIA
        // ====================================================
        if (interaction.commandName === "quitarcompra") {
            if (!esOwner(interaction)) return interaction.reply({ content: "❌ Solo el Owner puede utilizar este comando.", ephemeral: true });
            const referencia = interaction.options.getString("referencia").trim().toUpperCase();
            const db = cargarDB();
            const config = obtenerConfigKaamStore(db, interaction.guild.id);
            let encontrado = null;
            for (const [userId, datos] of Object.entries(config.usuarios || {})) {
                const idx = Array.isArray(datos.historial) ? datos.historial.findIndex(c => String(c.referencia || "").toUpperCase() === referencia) : -1;
                if (idx !== -1) { encontrado = { userId, datos, idx, compra: datos.historial[idx] }; break; }
            }
            if (!encontrado) return interaction.reply({ content: `❌ No encontré la compra **${referencia}** en este servidor.`, ephemeral: true });
            const { userId, datos, idx, compra } = encontrado;
            datos.historial.splice(idx, 1);
            // Recalcular a partir del historial restante para evitar desajustes.
            datos.robuxTotales = datos.historial.reduce((sum, c) => sum + Number(c.cantidad || 0), 0);
            datos.dineroGastado = Number(datos.historial.reduce((sum, c) => sum + Number(c.precio || 0), 0).toFixed(2));
            datos.compras = datos.historial.length;
            datos.historial.forEach(c => { c.robuxTotales = undefined; c.dineroGastado = undefined; });
            guardarDB(db);
            await actualizarRoles(interaction.guild, userId, datos.robuxTotales, config);
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("✅ Compra eliminada").setDescription(`Se eliminó la referencia **${referencia}**.`).addFields(
                { name: "Cliente", value: `<@${userId}>`, inline: true },
                { name: "Robux eliminados", value: formatearRobux(compra.cantidad || 0), inline: true },
                { name: "Nuevo total", value: `${formatearRobux(datos.robuxTotales)} Robux`, inline: true }
            ).setTimestamp()], ephemeral: true });
        }

        // ====================================================
        // ELIMINAR GRUPO
        // ====================================================
        if (interaction.commandName === "delgroup") {
            if (!esOwner(interaction)) return interaction.reply({ content: "❌ Solo el Owner puede utilizar este comando.", ephemeral: true });
            const groupId = extraerGroupId(interaction.options.getString("group_id"));
            if (!groupId) return interaction.reply({ content: "❌ No pude reconocer el Group ID.", ephemeral: true });
            const db = cargarDB();
            const guildData = db[interaction.guild.id] || {};
            if (!guildData[groupId]) return interaction.reply({ content: `❌ El grupo \`${groupId}\` no está configurado.`, ephemeral: true });
            const nombre = guildData[groupId].name || `Grupo ${groupId}`;
            delete guildData[groupId];
            db[interaction.guild.id] = guildData;
            guardarDB(db);
            return interaction.reply({ content: `✅ Se eliminó **${nombre}** (\`${groupId}\`) de la configuración.`, ephemeral: true });
        }
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);

process.on("unhandledRejection", error => console.error("❌ Promesa rechazada sin manejar:", error));
process.on("uncaughtException", error => { console.error("❌ Excepción no capturada:", error); });
