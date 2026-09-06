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

        fs.writeFileSync(
            DATABASE_FILE,
            "{}",
            "utf8"
        );
    }

    try {

        return JSON.parse(
            fs.readFileSync(
                DATABASE_FILE,
                "utf8"
            )
        );

    } catch (error) {

        console.error(
            "❌ Error leyendo la base de datos:",
            error
        );

        return {};
    }
}

function guardarDB(data) {

    try {

        fs.writeFileSync(
            DATABASE_FILE,
            JSON.stringify(
                data,
                null,
                2
            ),
            "utf8"
        );

    } catch (error) {

        console.error(
            "❌ Error guardando la base de datos:",
            error
        );
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

        const response =
            await axios.post(
                "https://users.roblox.com/v1/usernames/users",
                {
                    usernames: [
                        texto
                    ],
                    excludeBannedUsers: true
                },
                {
                    timeout: 10000
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
// ROBLOX OPEN CLOUD - GRUPO
// ============================================================

async function obtenerGrupo(
    groupId,
    apiKey
) {

    try {

        const response =
            await axios.get(
                `https://apis.roblox.com/cloud/v2/groups/${groupId}`,
                {
                    headers: {
                        "x-api-key":
                            apiKey,
                        "Accept":
                            "application/json"
                    },
                    timeout: 15000
                }
            );

        return response.data;

    } catch (error) {

        const status =
            error.response?.status;

        console.error(
            `❌ Error obteniendo grupo ${groupId}:`,
            status,
            error.response?.data ||
            error.message
        );

        if (status === 401) {
            throw new Error(
                "API_KEY_INVALID"
            );
        }

        if (status === 403) {
            throw new Error(
                "API_KEY_FORBIDDEN"
            );
        }

        if (status === 404) {
            throw new Error(
                "GROUP_NOT_FOUND"
            );
        }

        if (status === 429) {
            throw new Error(
                "ROBLOX_RATE_LIMIT"
            );
        }

        throw error;
    }
}

// ============================================================
// ROBLOX OPEN CLOUD - MEMBERSHIP
// ============================================================

async function obtenerMembresia(
    groupId,
    userId,
    apiKey
) {

    try {

        const response =
            await axios.get(
                `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships`,
                {
                    params: {
                        maxPageSize: 10,
                        filter:
                            `user == 'users/${userId}'`
                    },

                    headers: {
                        "x-api-key":
                            apiKey,
                        "Accept":
                            "application/json"
                    },

                    timeout: 15000
                }
            );

        const memberships =
            response.data?.groupMemberships ||
            [];

        if (
            memberships.length === 0
        ) {

            return null;
        }

        return memberships[0];

    } catch (error) {

        const status =
            error.response?.status;

        console.error(
            `❌ Error membership ${groupId}/${userId}:`,
            status
        );

        if (status === 401) {
            throw new Error(
                "API_KEY_INVALID"
            );
        }

        if (status === 403) {
            throw new Error(
                "API_KEY_FORBIDDEN"
            );
        }

        if (status === 404) {
            throw new Error(
                "GROUP_NOT_FOUND"
            );
        }

        if (status === 429) {
            throw new Error(
                "ROBLOX_RATE_LIMIT"
            );
        }

        throw error;
    }
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
// RESULTADO DE GRUPO
// ============================================================

function crearResultado(
    grupo,
    config,
    membership
) {

    const groupId =
        grupo.id?.toString() ||
        config.groupId;

    const nombre =
        grupo.displayName ||
        grupo.name ||
        config.name ||
        `Grupo ${groupId}`;

    const link =
        `https://www.roblox.com/groups/${groupId}`;

    const requerido =
        config.dias;

    if (!membership) {

        return {

            groupId,
            nombre,
            link,

            unido: false,

            dias: null,

            requerido,

            elegible: false,

            icono: "🔴",

            texto:
                "sin unirse"
        };
    }

    const dias =
        calcularDias(
            membership.createTime
        );

    if (
        dias === null
    ) {

        return {

            groupId,
            nombre,
            link,

            unido: true,

            dias: null,

            requerido,

            elegible: false,

            icono: "🟡",

            texto:
                "miembro — antigüedad no disponible"
        };
    }

    if (
        dias >= requerido
    ) {

        return {

            groupId,
            nombre,
            link,

            unido: true,

            dias,

            requerido,

            elegible: true,

            icono: "🟢",

            texto:
                `elegible — ${dias}d en el grupo`
        };
    }

    const faltan =
        requerido - dias;

    return {

        groupId,
        nombre,
        link,

        unido: true,

        dias,

        requerido,

        elegible: false,

        icono: "🟡",

        texto:
            `miembro — ${dias}d en el grupo • faltan ${faltan}d`
    };
}

// ============================================================
// EMBED DE VERIFICACIÓN
// ============================================================

function crearEmbed(
    userId,
    resultados
) {

    const total =
        resultados.length;

    const elegibles =
        resultados.filter(
            r => r.elegible
        ).length;

    const unidos =
        resultados.filter(
            r => r.unido
        ).length;

    const restantes =
        total -
        elegibles;

    let titulo;
    let color;

    if (
        elegibles === total
    ) {

        titulo =
            "🟢 Verificación completa";

        color =
            0x57F287;

    } else if (
        unidos > 0
    ) {

        titulo =
            "⚠️ Verificación parcial";

        color =
            0xFEE75C;

    } else {

        titulo =
            "🔴 Verificación fallida";

        color =
            0xED4245;
    }

    let lista = "";

    for (
        const resultado
        of resultados
    ) {

        lista +=
            `${resultado.icono} **${resultado.nombre}** — ${resultado.texto}\n`;
    }

    return new EmbedBuilder()

        .setColor(color)

        .setTitle(titulo)

        .setDescription(
            `🆔 **ID:** \`${userId}\`\n` +
            `🔗 [Ver perfil de Roblox](https://www.roblox.com/users/${userId}/profile)`
        )

        .addFields({

            name:
                "📋 Resultado",

            value:
                `🟢 **${elegibles}** elegible(s) • ` +
                `🔴 **${restantes}** restante(s)`
        })

        .addFields({

            name:
                "🏢 Grupos",

            value:
                lista ||
                "No hay grupos configurados."
        })

        .setFooter({

            text:
                "KaamStore BOT • Roblox Open Cloud"
        })

        .setTimestamp();
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
            "Configura una API Key de Roblox Open Cloud para que el bot pueda verificar grupos."
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
                    "El bot necesita permisos de lectura para consultar la información."
            },

            {
                name:
                    "5️⃣ Añadir grupo",

                value:
                    "`/addgroup group_id:123456 api_key:TU_KEY dias:3 verificado:si`"
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
                    "Nunca publiques tu API Key."
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
            // ADDGROUP
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "addgroup"
                )

                .setDescription(
                    "Añade un grupo de Roblox"
                )

                .addStringOption(
                    option =>
                        option

                            .setName(
                                "group_id"
                            )

                            .setDescription(
                                "ID o URL del grupo"
                            )

                            .setRequired(
                                true
                            )
                )

                .addStringOption(
                    option =>
                        option

                            .setName(
                                "api_key"
                            )

                            .setDescription(
                                "API Key de Roblox"
                            )

                            .setRequired(
                                true
                            )
                )

                .addIntegerOption(
                    option =>
                        option

                            .setName(
                                "dias"
                            )

                            .setDescription(
                                "3 o 15 días"
                            )

                            .setRequired(
                                true
                            )

                            .addChoices(

                                {
                                    name:
                                        "3 días",
                                    value:
                                        3
                                },

                                {
                                    name:
                                        "15 días",
                                    value:
                                        15
                                }
                            )
                )

                .addStringOption(
                    option =>
                        option

                            .setName(
                                "verificado"
                            )

                            .setDescription(
                                "¿Está verificado?"
                            )

                            .setRequired(
                                true
                            )

                            .addChoices(

                                {
                                    name:
                                        "Sí",
                                    value:
                                        "si"
                                },

                                {
                                    name:
                                        "No",
                                    value:
                                        "no"
                                }
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

        if (
            !interaction.isChatInputCommand()
        ) {

            return;
        }

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
        // ADDGROUP
        // ====================================================

        if (
            interaction.commandName ===
            "addgroup"
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

            const groupInput =
                interaction.options.getString(
                    "group_id"
                );

            const apiKey =
                interaction.options.getString(
                    "api_key"
                );

            const dias =
                interaction.options.getInteger(
                    "dias"
                );

            const verificado =
                interaction.options.getString(
                    "verificado"
                );

            const groupId =
                extraerGroupId(
                    groupInput
                );

            if (!groupId) {

                return interaction.reply({

                    content:
                        "❌ No pude reconocer el Group ID.",

                    ephemeral:
                        true
                });
            }

            if (
                verificado === "si" &&
                dias !== 3
            ) {

                return interaction.reply({

                    content:
                        "❌ Un grupo verificado debe tener **3 días**.",

                    ephemeral:
                        true
                });
            }

            if (
                verificado === "no" &&
                dias !== 15
            ) {

                return interaction.reply({

                    content:
                        "❌ Un grupo no verificado debe tener **15 días**.",

                    ephemeral:
                        true
                });
            }

            await interaction.deferReply({
                ephemeral:
                    true
            });

            try {

                const grupo =
                    await obtenerGrupo(
                        groupId,
                        apiKey
                    );

                const nombre =
                    grupo.displayName ||
                    grupo.name ||
                    `Grupo ${groupId}`;

                const db =
                    cargarDB();

                const guildId =
                    interaction.guild.id;

                if (
                    !db[guildId]
                ) {

                    db[guildId] = {};
                }

                db[guildId][groupId] = {

                    groupId,

                    name:
                        nombre,

                    apiKey:
                        cifrar(
                            apiKey
                        ),

                    dias,

                    verificado:
                        verificado === "si",

                    addedBy:
                        interaction.user.id,

                    addedAt:
                        new Date()
                            .toISOString()
                };

                guardarDB(
                    db
                );

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0x57F287
                            )

                            .setTitle(
                                "✅ Grupo configurado"
                            )

                            .setDescription(
                                `**${nombre}** fue añadido correctamente.`
                            )

                            .addFields(

                                {
                                    name:
                                        "🆔 Group ID",

                                    value:
                                        `\`${groupId}\``,

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "⭐ Verificado",

                                    value:
                                        verificado === "si"
                                            ? "🟢 Sí"
                                            : "🔴 No",

                                    inline:
                                        true
                                },

                                {
                                    name:
                                        "📅 Días",

                                    value:
                                        `**${dias} días**`,

                                    inline:
                                        true
                                }
                            )

                            .setFooter({

                                text:
                                    "KaamStore BOT"
                            })

                            .setTimestamp()
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ ERROR ADDGROUP:",
                    error
                );

                if (
                    error.message ===
                    "API_KEY_INVALID"
                ) {

                    return interaction.editReply(
                        "❌ API Key inválida."
                    );
                }

                if (
                    error.message ===
                    "API_KEY_FORBIDDEN"
                ) {

                    return interaction.editReply(
                        "❌ La API Key no tiene acceso a ese grupo."
                    );
                }

                if (
                    error.message ===
                    "GROUP_NOT_FOUND"
                ) {

                    return interaction.editReply(
                        "❌ Grupo no encontrado."
                    );
                }

                if (
                    error.message ===
                    "ROBLOX_RATE_LIMIT"
                ) {

                    return interaction.editReply(
                        "⏳ Roblox está limitando temporalmente las peticiones."
                    );
                }

                if (
                    error.message ===
                    "ENCRYPTION_SECRET_MISSING"
                ) {

                    return interaction.editReply(
                        "❌ Falta ENCRYPTION_SECRET en Render."
                    );
                }

                return interaction.editReply(
                    "❌ Ocurrió un error conectando con Roblox."
                );
            }
        }

        // ====================================================
        // USER
        // ====================================================

        if (
            interaction.commandName ===
            "user"
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
                    Object.keys(
                        grupos
                    ).filter(
                        id =>
                            id !== "kaamstore"
                    );

                if (
                    groupIds.length === 0
                ) {

                    return interaction.editReply(
                        "⚠️ No hay grupos configurados. Usa `/addgroup`."
                    );
                }

                const resultados = [];

                for (
                    const groupId
                    of groupIds
                ) {

                    const config =
                        grupos[groupId];

                    let apiKey;

                    try {

                        apiKey =
                            descifrar(
                                config.apiKey
                            );

                    } catch {

                        resultados.push({

                            groupId,

                            nombre:
                                config.name ||
                                `Grupo ${groupId}`,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido:
                                false,

                            dias:
                                null,

                            requerido:
                                config.dias,

                            elegible:
                                false,

                            icono:
                                "⚠️",

                            texto:
                                "API Key ilegible"
                        });

                        continue;
                    }

                    try {

                        const grupo =
                            await obtenerGrupo(
                                groupId,
                                apiKey
                            );

                        const membership =
                            await obtenerMembresia(
                                groupId,
                                userId,
                                apiKey
                            );

                        resultados.push(

                            crearResultado(
                                grupo,
                                config,
                                membership
                            )
                        );

                    } catch (error) {

                        let texto =
                            "error consultando Roblox";

                        if (
                            error.message ===
                            "API_KEY_INVALID"
                        ) {

                            texto =
                                "API Key inválida";

                        } else if (
                            error.message ===
                            "API_KEY_FORBIDDEN"
                        ) {

                            texto =
                                "API Key sin permiso";

                        } else if (
                            error.message ===
                            "ROBLOX_RATE_LIMIT"
                        ) {

                            texto =
                                "límite de Roblox";

                        } else if (
                            error.message ===
                            "GROUP_NOT_FOUND"
                        ) {

                            texto =
                                "grupo no encontrado";
                        }

                        resultados.push({

                            groupId,

                            nombre:
                                config.name ||
                                `Grupo ${groupId}`,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido:
                                false,

                            dias:
                                null,

                            requerido:
                                config.dias,

                            elegible:
                                false,

                            icono:
                                "⚠️",

                            texto
                        });
                    }
                }

                return interaction.editReply({

                    embeds: [

                        crearEmbed(
                            userId,
                            resultados
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
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);
