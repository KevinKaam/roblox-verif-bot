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
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// EXPRESS - RENDER
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
        discordReady: client.isReady(),
        bot: client.user
            ? client.user.tag
            : null,
        guilds: client.guilds.cache.size,
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
// LOGS Y ERRORES
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

client.on(
    "error",
    error => {
        console.error(
            "❌ ERROR CLIENTE DISCORD:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ PROMESA NO CONTROLADA:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ ERROR NO CONTROLADO:",
            error
        );
    }
);

// ============================================================
// BASE DE DATOS
// ============================================================

function cargarDB() {

    if (
        !fs.existsSync(
            DATABASE_FILE
        )
    ) {

        fs.writeFileSync(
            DATABASE_FILE,
            "{}",
            "utf8"
        );
    }

    try {

        const contenido =
            fs.readFileSync(
                DATABASE_FILE,
                "utf8"
            ).trim();

        if (!contenido) {
            return {};
        }

        return JSON.parse(
            contenido
        );

    } catch (error) {

        console.error(
            "❌ Error leyendo grupos_servidores.json:",
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

        return true;

    } catch (error) {

        console.error(
            "❌ Error guardando grupos_servidores.json:",
            error
        );

        return false;
    }
}

// ============================================================
// CIFRADO API KEY
// ============================================================

function getEncryptionKey() {

    if (!ENCRYPTION_SECRET) {

        throw new Error(
            "ENCRYPTION_SECRET_MISSING"
        );
    }

    return crypto
        .createHash(
            "sha256"
        )
        .update(
            ENCRYPTION_SECRET
        )
        .digest();
}

function cifrar(texto) {

    const key =
        getEncryptionKey();

    const iv =
        crypto.randomBytes(
            16
        );

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

    if (
        typeof texto !==
        "string"
    ) {

        throw new Error(
            "INVALID_ENCRYPTED_KEY"
        );
    }

    const key =
        getEncryptionKey();

    const partes =
        texto.split(
            ":"
        );

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

function esOwner(
    interaction
) {

    return (
        interaction.user.id ===
        OWNER_ID
    );
}

// ============================================================
// UTILIDADES
// ============================================================

function extraerGroupId(input) {

    if (!input) {
        return null;
    }

    const texto =
        input.trim();

    if (
        /^\d+$/.test(
            texto
        )
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
        texto.match(
            /\d+/
        );

    return numero
        ? numero[0]
        : null;
}

function formatearRobux(
    numero
) {

    return Number(
        numero || 0
    ).toLocaleString(
        "en-US"
    );
}

function formatearUSD(
    numero
) {

    return Number(
        numero || 0
    ).toFixed(
        2
    );
}

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

function crearReferencia() {

    const caracteres =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let codigo =
        "";

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
// CONFIGURACIÓN KAAMSTORE
// ============================================================

function obtenerConfigKaamStore(
    db,
    guildId
) {

    if (
        !db[guildId] ||
        Array.isArray(
            db[guildId]
        )
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

            usuarios:
                {}
        };
    }

    const config =
        db[guildId].kaamstore;

    if (
        !config.roles
    ) {

        config.roles =
            {};
    }

    if (
        !config.usuarios
    ) {

        config.usuarios =
            {};
    }

    const roles =
        [
            "role1k",
            "role10k",
            "role100k",
            "role500k",
            "role1m"
        ];

    for (
        const roleName
        of roles
    ) {

        if (
            !Object.prototype.hasOwnProperty.call(
                config.roles,
                roleName
            )
        ) {

            config.roles[
                roleName
            ] = null;
        }
    }

    if (
        typeof config.precio1k !==
        "number" ||
        Number.isNaN(
            config.precio1k
        )
    ) {

        config.precio1k =
            DEFAULT_1K_BASE;
    }

    return config;
}

// ============================================================
// ROBLOX - USER ID
// ============================================================

async function obtenerUserId(
    input
) {

    const texto =
        input.trim();

    if (
        /^\d+$/.test(
            texto
        )
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

                    excludeBannedUsers:
                        true
                },
                {
                    timeout:
                        15000
                }
            );

        const usuarios =
            response.data?.data ||
            [];

        if (
            usuarios.length === 0
        ) {

            return null;
        }

        return usuarios[0]
            .id
            .toString();

    } catch (error) {

        console.error(
            "❌ Error buscando usuario Roblox:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// ============================================================
// ROBLOX - ERRORES
// ============================================================

function traducirErrorRoblox(
    error
) {

    const status =
        error.response?.status;

    if (
        status === 401
    ) {

        return "API_KEY_INVALID";
    }

    if (
        status === 403
    ) {

        return "API_KEY_FORBIDDEN";
    }

    if (
        status === 404
    ) {

        return "GROUP_NOT_FOUND";
    }

    if (
        status === 429
    ) {

        return "ROBLOX_RATE_LIMIT";
    }

    return null;
}

// ============================================================
// ROBLOX - OBTENER GRUPO
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

                    timeout:
                        15000
                }
            );

        return response.data;

    } catch (error) {

        console.error(
            `❌ ERROR GRUPO ${groupId}:`,
            error.response?.status ||
            error.message
        );

        const codigo =
            traducirErrorRoblox(
                error
            );

        if (codigo) {

            throw new Error(
                codigo
            );
        }

        throw error;
    }
}

// ============================================================
// ROBLOX - MEMBRESÍA
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

                        maxPageSize:
                            10,

                        filter:
                            `user == 'users/${userId}'`
                    },

                    headers: {

                        "x-api-key":
                            apiKey,

                        "Accept":
                            "application/json"
                    },

                    timeout:
                        15000
                }
            );

        const memberships =
            response.data?.groupMemberships ||
            response.data?.data ||
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
            `❌ ERROR MEMBERSHIP ${groupId}/${userId}:`,
            status ||
            error.message
        );

        // Si Roblox responde que no existe
        // la membresía, lo tratamos como no unido.
        if (
            status === 404
        ) {

            return null;
        }

        const codigo =
            traducirErrorRoblox(
                error
            );

        if (codigo) {

            throw new Error(
                codigo
            );
        }

        throw error;
    }
}

// ============================================================
// CALCULAR DÍAS
// ============================================================

function calcularDias(
    createTime
) {

    if (!createTime) {

        return null;
    }

    const fecha =
        new Date(
            createTime
        );

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
// RESULTADO VERIFICACIÓN
// ============================================================

function crearResultado(
    grupo,
    config,
    membership
) {

    const groupId =
        grupo?.id?.toString() ||
        config.groupId;

    const nombre =
        grupo?.displayName ||
        grupo?.name ||
        config.name ||
        `Grupo ${groupId}`;

    const link =
        `https://www.roblox.com/groups/${groupId}`;

    const requerido =
        Number(
            config.dias || 15
        );

    if (!membership) {

        return {

            groupId,
            nombre,
            link,

            unido:
                false,

            dias:
                null,

            requerido,

            elegible:
                false,

            icono:
                "🔴",

            texto:
                "sin unirse"
        };
    }

    const createTime =
        membership.createTime ||
        membership.createdAt ||
        membership.joined;

    const dias =
        calcularDias(
            createTime
        );

    if (
        dias === null
    ) {

        return {

            groupId,
            nombre,
            link,

            unido:
                true,

            dias:
                null,

            requerido,

            elegible:
                false,

            icono:
                "🟡",

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

            unido:
                true,

            dias,

            requerido,

            elegible:
                true,

            icono:
                "🟢",

            texto:
                `elegible — ${dias}d en el grupo`
        };
    }

    const faltan =
        requerido -
        dias;

    return {

        groupId,
        nombre,
        link,

        unido:
            true,

        dias,

        requerido,

        elegible:
            false,

        icono:
            "🟡",

        texto:
            `miembro — ${dias}d en el grupo • faltan ${faltan}d`
    };
}

// ============================================================
// EMBED VERIFICACIÓN
// ============================================================

function crearEmbed(
    userId,
    resultados
) {

    const total =
        resultados.length;

    const elegibles =
        resultados.filter(
            r =>
                r.elegible
        ).length;

    const unidos =
        resultados.filter(
            r =>
                r.unido
        ).length;

    const restantes =
        total -
        elegibles;

    let titulo =
        "🔴 Verificación fallida";

    let color =
        0xED4245;

    if (
        elegibles === total &&
        total > 0
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
    }

    let lista =
        "";

    for (
        const resultado
        of resultados
    ) {

        lista +=
            `${resultado.icono} **${resultado.nombre}** — ${resultado.texto}\n`;
    }

    return new EmbedBuilder()

        .setColor(
            color
        )

        .setTitle(
            titulo
        )

        .setDescription(
            `🆔 **ID:** \`${userId}\`\n` +
            `🔗 [Ver perfil de Roblox](https://www.roblox.com/users/${userId}/profile)`
        )

        .addFields(

            {

                name:
                    "📋 Resultado",

                value:
                    `🟢 **${elegibles}** elegible(s) • ` +
                    `🔴 **${restantes}** restante(s)`
            },

            {

                name:
                    "🏢 Grupos",

                value:
                    lista ||
                    "No hay grupos configurados."
            }
        )

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

    const filas =
        [];

    let fila =
        new ActionRowBuilder();

    let cantidad =
        0;

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

            cantidad =
                0;
        }

        const nombre =
            resultado.nombre.length > 70
                ? resultado.nombre.slice(
                    0,
                    67
                ) + "..."
                : resultado.nombre;

        fila.addComponents(

            new ButtonBuilder()

                .setLabel(
                    nombre
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

    return filas.slice(
        0,
        5
    );
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
            "Configura una API Key de Roblox Open Cloud para verificar usuarios y consultar la antigüedad dentro de tus grupos."
        )

        .addFields(

            {

                name:
                    "1️⃣ Abrir Creator Dashboard",

                value:
                    "[Abrir API Keys de Roblox](https://create.roblox.com/dashboard/credentials)"
            },

            {

                name:
                    "2️⃣ Crear una API Key",

                value:
                    "Pulsa **Create API Key** y ponle un nombre."
            },

            {

                name:
                    "3️⃣ Añadir el grupo",

                value:
                    "Selecciona el sistema **Group** y el grupo que quieres conectar."
            },

            {

                name:
                    "4️⃣ Permisos",

                value:
                    "Configura los permisos necesarios de **lectura (Read)**."
            },

            {

                name:
                    "5️⃣ Configurar el bot",

                value:
                    "`/addgroup group_id:123456 api_key:TU_KEY dias:3 verificado:si`"
            },

            {

                name:
                    "⭐ Días",

                value:
                    "🟢 Verificado → **3 días**\n🔴 No verificado → **15 días**"
            },

            {

                name:
                    "⚠️ Seguridad",

                value:
                    "Nunca compartas tu API Key. KaamStore BOT la guarda cifrada."
            }
        )

        .setFooter({

            text:
                "KaamStore BOT"
        })

        .setTimestamp();
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

        const rolesConfigurados =
            [

                config.roles.role1k,

                config.roles.role10k,

                config.roles.role100k,

                config.roles.role500k,

                config.roles.role1m

            ].filter(
                Boolean
            );

        // Quitar rangos anteriores
        for (
            const roleId
            of rolesConfigurados
        ) {

            const esRangoActual =
                rango.clave &&
                config.roles[
                    rango.clave
                ] === roleId;

            if (
                miembro.roles.cache.has(
                    roleId
                ) &&
                !esRangoActual
            ) {

                try {

                    await miembro.roles.remove(
                        roleId
                    );

                } catch (error) {

                    console.error(
                        `❌ Error quitando rol ${roleId}:`,
                        error.message
                    );
                }
            }
        }

        // Añadir rango actual
        if (
            rango.clave
        ) {

            const roleId =
                config.roles[
                    rango.clave
                ];

            if (
                roleId &&
                !miembro.roles.cache.has(
                    roleId
                )
            ) {

                try {

                    const role =
                        guild.roles.cache.get(
                            roleId
                        ) ||
                        await guild.roles.fetch(
                            roleId
                        );

                    if (role) {

                        await miembro.roles.add(
                            role
                        );

                        console.log(
                            `🏆 Rol añadido: ${role.name} -> ${miembro.user.tag}`
                        );
                    }

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
            "❌ ERROR ACTUALIZANDO ROLES:",
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

    try {

        const canal =
            guild.channels.cache.get(
                config.canalAutovouch
            ) ||
            await guild.channels.fetch(
                config.canalAutovouch
            );

        if (
            !canal ||
            !canal.isTextBased()
        ) {

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
                        size:
                            256
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

        await canal.send({

            embeds: [
                embed
            ]
        });

        console.log(
            `🧾 Autovouch enviado: ${usuario.tag}`
        );

    } catch (error) {

        console.error(
            "❌ ERROR AUTOVOUCH:",
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
            "🛒 Estadísticas de KaamStore"
        )

        .setThumbnail(
            usuario.displayAvatarURL({
                size:
                    256
            })
        )

        .setDescription(
            `${usuario}\n\nEstadísticas públicas de compras en **KaamStore**.`
        )

        .addFields(

            {

                name:
                    "🏆 Rango actual",

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
                    "🛍️ Compras totales",

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
                    `1K = **$${formatearUSD(precioBase)} USD**`,

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

function crearSinComprasEmbed(
    usuario
) {

    return new EmbedBuilder()

        .setColor(
            0xFEE75C
        )

        .setTitle(
            "🛒 Perfil KaamStore"
        )

        .setThumbnail(
            usuario.displayAvatarURL({
                size:
                    256
            })
        )

        .setDescription(
            `${usuario}\n\n⚠️ **No tiene ninguna compra registrada en KaamStore.**`
        )

        .setFooter({

            text:
                "KaamStore • Perfil público"
        })

        .setTimestamp();
}

// ============================================================
// COMANDOS
// ============================================================

function crearComandos() {

    return [

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
                            "Username, ID o URL de Roblox"
                        )

                        .setRequired(
                            true
                        )
            ),

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
                            "¿El grupo está verificado?"
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

        new SlashCommandBuilder()

            .setName(
                "tutorial"
            )

            .setDescription(
                "Tutorial para configurar Roblox"
            ),

        new SlashCommandBuilder()

            .setName(
                "perfil"
            )

            .setDescription(
                "Muestra tu perfil público de KaamStore"
            ),

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
}

// ============================================================
// REGISTRAR COMANDOS POR SERVIDOR
// ============================================================

async function registrarComandosEnServidor(
    guild
) {

    if (
        !TOKEN ||
        !CLIENT_ID
    ) {

        console.error(
            "❌ No puedo registrar comandos: faltan variables."
        );

        return;
    }

    try {

        const rest =
            new REST({
                version:
                    "10"
            }).setToken(
                TOKEN
            );

        await rest.put(

            Routes.applicationGuildCommands(
                CLIENT_ID,
                guild.id
            ),

            {

                body:
                    crearComandos()
            }
        );

        console.log(
            `✅ Comandos registrados en ${guild.name} (${guild.id})`
        );

    } catch (error) {

        console.error(
            `❌ Error registrando comandos en ${guild.name}:`,
            error
        );
    }
}

// ============================================================
// READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            "========================================"
        );

        console.log(
            `🟢 DISCORD CONECTADO COMO: ${client.user.tag}`
        );

        console.log(
            `🟢 SERVIDORES: ${client.guilds.cache.size}`
        );

        console.log(
            "========================================"
        );

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            await registrarComandosEnServidor(
                guild
            );
        }
    }
);

// ============================================================
// NUEVO SERVIDOR
// ============================================================

client.on(
    "guildCreate",
    async guild => {

        console.log(
            `🟢 Bot añadido a: ${guild.name}`
        );

        await registrarComandosEnServidor(
            guild
        );
    }
);

// ============================================================
// RESPONDER ERROR
// ============================================================

async function responderError(
    interaction,
    error
) {

    console.error(
        `❌ ERROR EN /${interaction.commandName}:`,
        error
    );

    const mensaje =
        "❌ Ocurrió un error procesando este comando. Revisa los Logs de Render.";

    try {

        if (
            interaction.deferred ||
            interaction.replied
        ) {

            await interaction.editReply({
                content:
                    mensaje,

                embeds:
                    [],

                components:
                    []
            });

        } else {

            await interaction.reply({

                content:
                    mensaje,

                ephemeral:
                    true
            });
        }

    } catch (replyError) {

        console.error(
            "❌ ERROR RESPONDIENDO EL ERROR:",
            replyError
        );
    }
}

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

        console.log(
            `📥 COMANDO RECIBIDO: /${interaction.commandName} | Usuario: ${interaction.user.tag} (${interaction.user.id}) | Servidor: ${interaction.guild?.name || "DM"}`
        );

        try {

            if (
                !interaction.inGuild()
            ) {

                await interaction.reply({

                    content:
                        "❌ Este comando solo puede utilizarse dentro de un servidor.",

                    ephemeral:
                        true
                });

                return;
            }

            // ====================================================
            // PERFIL
            // ====================================================

            if (
                interaction.commandName ===
                "perfil"
            ) {

                // RESPUESTA INMEDIATA
                await interaction.deferReply();

                const db =
                    cargarDB();

                const config =
                    obtenerConfigKaamStore(
                        db,
                        interaction.guild.id
                    );

                // Solo permitir el comando en el canal configurado
                if (
                    config.canalComandos &&
                    interaction.channelId !==
                    config.canalComandos
                ) {

                    const canal =
                        interaction.guild.channels.cache.get(
                            config.canalComandos
                        );

                    await interaction.editReply({

                        content:
                            canal
                                ? `❌ El comando \`/perfil\` solamente puede utilizarse en ${canal}.`
                                : "❌ Este comando solamente puede utilizarse en el canal configurado."
                    });

                    return;
                }

                const datos =
                    config.usuarios[
                        interaction.user.id
                    ];

                if (
                    !datos ||
                    Number(
                        datos.robuxTotales || 0
                    ) <= 0
                ) {

                    await interaction.editReply({

                        embeds: [

                            crearSinComprasEmbed(
                                interaction.user
                            )

                        ]
                    });

                    return;
                }

                await interaction.editReply({

                    embeds: [

                        crearPerfilEmbed(

                            interaction.user,

                            datos,

                            config.precio1k
                        )

                    ]
                });

                return;
            }

            // ====================================================
            // COMANDOS OWNER
            // ====================================================

            const comandosOwner =
                [

                    "tutorial",

                    "addgroup",

                    "user",

                    "config",

                    "1kbase",

                    "addcompra"

                ];

            if (
                comandosOwner.includes(
                    interaction.commandName
                ) &&
                !esOwner(
                    interaction
                )
            ) {

                await interaction.reply({

                    content:
                        "❌ Solo el Owner puede utilizar este comando.",

                    ephemeral:
                        true
                });

                return;
            }

            // ====================================================
            // TUTORIAL
            // ====================================================

            if (
                interaction.commandName ===
                "tutorial"
            ) {

                await interaction.reply({

                    embeds: [
                        crearTutorial()
                    ],

                    ephemeral:
                        true
                });

                return;
            }

            // ====================================================
            // ADDGROUP
            // ====================================================

            if (
                interaction.commandName ===
                "addgroup"
            ) {

                // RESPONDER INMEDIATAMENTE
                await interaction.deferReply({

                    ephemeral:
                        true
                });

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

                    await interaction.editReply(
                        "❌ No pude reconocer el Group ID."
                    );

                    return;
                }

                if (
                    verificado === "si" &&
                    dias !== 3
                ) {

                    await interaction.editReply(
                        "❌ Un grupo verificado debe tener exactamente **3 días**."
                    );

                    return;
                }

                if (
                    verificado === "no" &&
                    dias !== 15
                ) {

                    await interaction.editReply(
                        "❌ Un grupo no verificado debe tener exactamente **15 días**."
                    );

                    return;
                }

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

                    if (
                        !db[
                            interaction.guild.id
                        ] ||
                        Array.isArray(
                            db[
                                interaction.guild.id
                            ]
                        )
                    ) {

                        db[
                            interaction.guild.id
                        ] = {};
                    }

                    // MANTENER MISMA ESTRUCTURA
                    db[
                        interaction.guild.id
                    ][
                        groupId
                    ] = {

                        groupId,

                        name:
                            nombre,

                        apiKey:
                            cifrar(
                                apiKey
                            ),

                        dias,

                        verificado:
                            verificado ===
                            "si",

                        addedBy:
                            interaction.user.id,

                        addedAt:
                            new Date()
                                .toISOString()
                    };

                    guardarDB(
                        db
                    );

                    await interaction.editReply({

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
                                            "📅 Días requeridos",

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

                    return;

                } catch (error) {

                    console.error(
                        "❌ ERROR ADDGROUP:",
                        error
                    );

                    let mensaje =
                        "❌ Ocurrió un error conectando con Roblox.";

                    if (
                        error.message ===
                        "API_KEY_INVALID"
                    ) {

                        mensaje =
                            "❌ API Key inválida.";

                    } else if (
                        error.message ===
                        "API_KEY_FORBIDDEN"
                    ) {

                        mensaje =
                            "❌ La API Key no tiene acceso a ese grupo.";

                    } else if (
                        error.message ===
                        "GROUP_NOT_FOUND"
                    ) {

                        mensaje =
                            "❌ Grupo no encontrado.";

                    } else if (
                        error.message ===
                        "ROBLOX_RATE_LIMIT"
                    ) {

                        mensaje =
                            "⏳ Roblox está limitando temporalmente las peticiones.";

                    } else if (
                        error.message ===
                        "ENCRYPTION_SECRET_MISSING"
                    ) {

                        mensaje =
                            "❌ Falta ENCRYPTION_SECRET en Render.";
                    }

                    await interaction.editReply(
                        mensaje
                    );

                    return;
                }
            }

            // ====================================================
            // USER
            // ====================================================

            if (
                interaction.commandName ===
                "user"
            ) {

                // RESPONDER INMEDIATAMENTE
                await interaction.deferReply();

                try {

                    const input =
                        interaction.options.getString(
                            "usuario"
                        );

                    const userId =
                        await obtenerUserId(
                            input
                        );

                    if (!userId) {

                        await interaction.editReply(
                            "❌ No encontré ese usuario de Roblox."
                        );

                        return;
                    }

                    const db =
                        cargarDB();

                    const grupos =
                        db[
                            interaction.guild.id
                        ] || {};

                    const groupIds =
                        Object.keys(
                            grupos
                        )

                            .filter(
                                id =>
                                    id !==
                                    "kaamstore"
                            )

                            .filter(
                                id =>
                                    grupos[id] &&
                                    typeof grupos[id] ===
                                    "object" &&
                                    grupos[id].apiKey
                            );

                    if (
                        groupIds.length === 0
                    ) {

                        await interaction.editReply(
                            "⚠️ No hay grupos configurados. Usa `/addgroup`."
                        );

                        return;
                    }

                    const resultados =
                        [];

                    for (
                        const groupId
                        of groupIds
                    ) {

                        const config =
                            grupos[
                                groupId
                            ];

                        try {

                            const apiKey =
                                descifrar(
                                    config.apiKey
                                );

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

                            console.error(
                                `❌ ERROR GRUPO ${groupId}:`,
                                error
                            );

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
                                    "límite temporal de Roblox";

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
                                    config.dias ||
                                    15,

                                elegible:
                                    false,

                                icono:
                                    "⚠️",

                                texto
                            });
                        }
                    }

                    await interaction.editReply({

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

                    return;

                } catch (error) {

                    console.error(
                        "❌ ERROR USER:",
                        error
                    );

                    await interaction.editReply(
                        "❌ Ocurrió un error realizando la verificación."
                    );

                    return;
                }
            }

            // ====================================================
            // CONFIG
            // ====================================================

            if (
                interaction.commandName ===
                "config"
            ) {

                await interaction.deferReply({

                    ephemeral:
                        true
                });

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

                const config =
                    obtenerConfigKaamStore(

                        db,

                        interaction.guild.id
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

                await interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0x57F287
                            )

                            .setTitle(
                                "⚙️ KaamStore configurado"
                            )

                            .setDescription(
                                "La configuración fue guardada correctamente."
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
                                        "💬 Canal de comandos",

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

                    ]
                });

                return;
            }

            // ====================================================
            // 1KBASE
            // ====================================================

            if (
                interaction.commandName ===
                "1kbase"
            ) {

                await interaction.deferReply({

                    ephemeral:
                        true
                });

                const nuevoPrecio =
                    interaction.options.getNumber(
                        "base"
                    );

                const db =
                    cargarDB();

                const config =
                    obtenerConfigKaamStore(

                        db,

                        interaction.guild.id
                    );

                const anterior =
                    config.precio1k;

                config.precio1k =
                    Number(
                        nuevoPrecio.toFixed(
                            2
                        )
                    );

                guardarDB(
                    db
                );

                await interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0x57F287
                            )

                            .setTitle(
                                "💰 Precio actualizado"
                            )

                            .setDescription(
                                "El precio base fue cambiado correctamente."
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

                    ]
                });

                return;
            }

            // ====================================================
            // ADDCOMPRA
            // ====================================================

            if (
                interaction.commandName ===
                "addcompra"
            ) {

                // RESPUESTA INMEDIATA
                await interaction.deferReply({

                    ephemeral:
                        true
                });

                const usuario =
                    interaction.options.getUser(
                        "usuario"
                    );

                const cantidad =
                    interaction.options.getInteger(
                        "cantidad"
                    );

                if (
                    !cantidad ||
                    cantidad <= 0
                ) {

                    await interaction.editReply(
                        "❌ La cantidad debe ser mayor a 0."
                    );

                    return;
                }

                try {

                    const db =
                        cargarDB();

                    const config =
                        obtenerConfigKaamStore(

                            db,

                            interaction.guild.id
                        );

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

                    if (
                        !Array.isArray(
                            datos.historial
                        )
                    ) {

                        datos.historial =
                            [];
                    }

                    const precio =
                        calcularPrecio(

                            cantidad,

                            config.precio1k
                        );

                    datos.robuxTotales =
                        Number(
                            datos.robuxTotales ||
                            0
                        ) +
                        cantidad;

                    datos.dineroGastado =
                        Number(
                            datos.dineroGastado ||
                            0
                        ) +
                        precio;

                    datos.compras =
                        Number(
                            datos.compras ||
                            0
                        ) +
                        1;

                    const referencia =
                        crearReferencia();

                    const compra =
                        {

                            referencia,

                            cantidad,

                            precio:
                                Number(
                                    precio.toFixed(
                                        2
                                    )
                                ),

                            precioBase:
                                Number(
                                    config.precio1k.toFixed(
                                        2
                                    )
                                ),

                            robuxTotales:
                                datos.robuxTotales,

                            dineroGastado:
                                Number(
                                    datos.dineroGastado.toFixed(
                                        2
                                    )
                                ),

                            fecha:
                                new Date()
                                    .toISOString(),

                            agregadoPor:
                                interaction.user.id
                        };

                    datos.historial.push(
                        compra
                    );

                    // GUARDAR ANTES DE ROLES/AUTOVOUCH
                    // PARA NO PERDER LA COMPRA
                    guardarDB(
                        db
                    );

                    // Intentar actualizar roles
                    await actualizarRoles(

                        interaction.guild,

                        usuario.id,

                        datos.robuxTotales,

                        config
                    );

                    // Intentar enviar autovouch
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

                    await interaction.editReply({

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
                                            `${ROBUX_EMOJI} Total comprado`,

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

                    return;

                } catch (error) {

                    console.error(
                        "❌ ERROR ADDCOMPRA:",
                        error
                    );

                    await interaction.editReply(
                        "❌ Ocurrió un error registrando la compra."
                    );

                    return;
                }
            }

            // ====================================================
            // COMANDO NO MANEJADO
            // ====================================================

            console.warn(
                `⚠️ COMANDO SIN MANEJADOR: /${interaction.commandName}`
            );

            await interaction.reply({

                content:
                    "❌ Ese comando no tiene un manejador configurado.",

                ephemeral:
                    true
            });

        } catch (error) {

            await responderError(
                interaction,
                error
            );
        }
    }
);

// ============================================================
// LOGIN
// ============================================================

if (!TOKEN) {

    console.error(
        "❌ El bot no puede iniciar porque falta DISCORD_TOKEN."
    );

} else {

    client.login(
        TOKEN
    )

        .catch(
            error => {

                console.error(
                    "❌ Error iniciando sesión en Discord:",
                    error
                );
            }
        );
}
