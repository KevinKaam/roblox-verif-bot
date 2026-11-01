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
// ROBLOX API PÚBLICA - SIN API KEY
// ============================================================

async function obtenerGrupoPublico(groupId) {
    try {
        const response = await axios.get(
            `https://groups.roblox.com/v1/groups/${groupId}`,
            { timeout: 15000 }
        );
        return response.data;
    } catch (error) {
        const status = error.response?.status;
        console.error(`❌ Error obteniendo grupo ${groupId}:`, status, error.response?.data || error.message);
        if (status === 404) throw new Error('GROUP_NOT_FOUND');
        if (status === 429) throw new Error('ROBLOX_RATE_LIMIT');
        throw error;
    }
}

async function obtenerGruposPublicosUsuario(userId) {
    try {
        const response = await axios.get(
            `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
            { timeout: 20000 }
        );
        return Array.isArray(response.data?.data) ? response.data.data : [];
    } catch (error) {
        const status = error.response?.status;
        console.error(`❌ Error consultando grupos del usuario ${userId}:`, status, error.response?.data || error.message);
        if (status === 429) throw new Error('ROBLOX_RATE_LIMIT');
        if (status === 404) throw new Error('ROBLOX_USER_NOT_FOUND');
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

function crearResultado(grupo, config, esMiembro) {
    const groupId = String(grupo.id || config.groupId);
    const nombre = grupo.name || grupo.displayName || config.name || `Grupo ${groupId}`;
    const link = `https://www.roblox.com/groups/${groupId}`;
    const requerido = Number(config.dias) || 15;

    if (!esMiembro) {
        return { groupId, nombre, link, unido: false, dias: null, requerido,
            elegible: false, icono: '🔴', texto: 'sin unirse' };
    }

    // El endpoint público de grupos confirma pertenencia, pero no entrega
    // la fecha de ingreso. No se inventa antigüedad ni se usa un contador local.
    return { groupId, nombre, link, unido: true, dias: null, requerido,
        elegible: false, icono: '🟡', texto: 'miembro — fecha de ingreso no disponible públicamente' };
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

    const elegibles = resultados.filter(r => r.elegible).length;
    const unidos = resultados.filter(r => r.unido).length;
    const sinUnirse = total - unidos;
    const antiguedadPendiente = resultados.filter(r => r.unido && r.dias === null).length;

    let titulo;
    let color;
    if (sinUnirse === 0 && antiguedadPendiente === 0 && elegibles === total) {
        titulo = "🟢 Verificación completa";
        color = 0x57F287;
    } else if (unidos > 0) {
        titulo = "⚠️ Verificación de pertenencia";
        color = 0xFEE75C;
    } else {
        titulo = "🔴 Verificación fallida";
        color = 0xED4245;
    }

    let lista = "";

    for (
        const resultado
        of resultados.slice(0, 25)
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
                `👥 **${unidos}** miembro(s) • 🔴 **${sinUnirse}** sin unirse\n` +
                `🟢 **${elegibles}** elegible(s) • 🟡 **${antiguedadPendiente}** con antigüedad no disponible`
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
                "KaamStore BOT • Verificación pública de Roblox"
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
        of resultados.slice(0, 25)
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
        .setColor(0x5865F2)
        .setTitle('🔎 Verificación pública de Roblox')
        .setDescription(
            'KaamStore BOT consulta los grupos públicos del perfil de Roblox. **No necesitas API Key ni permisos del dueño del grupo.**'
        )
        .addFields(
            { name: '1️⃣ Añadir un grupo', value: '`/addgroup group_id:123456 dias:15 verificado:no`' },
            { name: '2️⃣ Consultar un usuario', value: '`/user usuario:NombreDeRoblox`' },
            { name: '3️⃣ Eliminar un grupo', value: '`/removegroup group_id:123456`' },
            { name: '⚠️ Importante sobre la antigüedad', value: 'Roblox permite consultar públicamente si el usuario pertenece al grupo, pero esta consulta no devuelve la fecha de ingreso. El bot mostrará la pertenencia y señalará que la antigüedad no está disponible; no inventará días ni fechas.' }
        )
        .setFooter({ text: 'KaamStore BOT' })
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
            // ADDGROUP (SIN API KEY)
            // ------------------------------------------------

            new SlashCommandBuilder()
                .setName('addgroup')
                .setDescription('Añade un grupo público de Roblox')
                .addStringOption(option => option
                    .setName('group_id')
                    .setDescription('ID o URL del grupo')
                    .setRequired(true))
                .addIntegerOption(option => option
                    .setName('dias')
                    .setDescription('3 o 15 días de requisito')
                    .setRequired(true)
                    .addChoices(
                        { name: '3 días', value: 3 },
                        { name: '15 días', value: 15 }
                    ))
                .addStringOption(option => option
                    .setName('verificado')
                    .setDescription('¿Está verificado?')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Sí', value: 'si' },
                        { name: 'No', value: 'no' }
                    )),

            // ------------------------------------------------
            // REMOVEGROUP
            // ------------------------------------------------

            new SlashCommandBuilder()
                .setName('removegroup')
                .setDescription('Elimina un grupo de la verificación')
                .addStringOption(option => option
                    .setName('group_id')
                    .setDescription('ID o URL del grupo')
                    .setRequired(true)),

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
            // TOP COMPRADORES
            // ------------------------------------------------

            new SlashCommandBuilder()
                .setName('top')
                .setDescription('Muestra el top 10 de compradores de KaamStore'),

            // ------------------------------------------------
            // QUITAR COMPRA
            // ------------------------------------------------

            new SlashCommandBuilder()
                .setName('quitarcompra')
                .setDescription('Elimina una compra del historial de un cliente')
                .addUserOption(option => option
                    .setName('usuario')
                    .setDescription('Cliente al que pertenece la compra')
                    .setRequired(true))
                .addStringOption(option => option
                    .setName('referencia')
                    .setDescription('Referencia exacta de la compra')
                    .setRequired(true)),

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
                "✅ Comandos slash registrados correctamente."
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
// EVENTO INTERACTIONS
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

            return interaction.reply({

                embeds: [

                    crearTutorial()
                ],

                ephemeral:
                    true
            });
        }

        // ====================================================
        // ADDGROUP (SIN API KEY)
        // ====================================================

        if (interaction.commandName === 'addgroup') {
            if (!esOwner(interaction)) {
                return interaction.reply({ content: '❌ Solo el Owner puede utilizar este comando.', ephemeral: true });
            }

            const groupId = extraerGroupId(interaction.options.getString('group_id'));
            const dias = interaction.options.getInteger('dias');
            const verificado = interaction.options.getString('verificado');

            if (!groupId) {
                return interaction.reply({ content: '❌ No pude reconocer el Group ID. Usa el ID o la URL del grupo.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const grupo = await obtenerGrupoPublico(groupId);
                const db = cargarDB();
                const guildId = interaction.guild.id;

                db[guildId] = db[guildId] || {};
                db[guildId][groupId] = {
                    groupId,
                    name: grupo.name,
                    dias,
                    verificado,
                    addedBy: interaction.user.id,
                    addedAt: new Date().toISOString()
                };

                guardarDB(db);

                return interaction.editReply({ embeds: [new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Grupo añadido')
                    .setDescription(`**${grupo.name}** fue añadido correctamente sin API Key.`)
                    .addFields(
                        { name: '🆔 Group ID', value: `\`${groupId}\``, inline: true },
                        { name: '⭐ Verificado', value: verificado === 'si' ? '🟢 Sí' : '🔴 No', inline: true },
                        { name: '📅 Requisito', value: `**${dias} días**`, inline: true }
                    )
                    .setFooter({ text: 'KaamStore BOT • API pública de Roblox' })
                    .setTimestamp()] });
            } catch (error) {
                console.error('❌ ERROR ADDGROUP:', error);
                if (error.message === 'GROUP_NOT_FOUND') return interaction.editReply('❌ Grupo no encontrado. Comprueba el ID o la URL.');
                if (error.message === 'ROBLOX_RATE_LIMIT') return interaction.editReply('⏳ Roblox está limitando temporalmente las peticiones. Inténtalo de nuevo en unos minutos.');
                return interaction.editReply('❌ No pude consultar el grupo en Roblox. Comprueba que el grupo sea público e inténtalo de nuevo.');
            }
        }

        // ====================================================
        // REMOVEGROUP
        // ====================================================

        if (interaction.commandName === 'removegroup') {
            if (!esOwner(interaction)) {
                return interaction.reply({ content: '❌ Solo el Owner puede utilizar este comando.', ephemeral: true });
            }
            const groupId = extraerGroupId(interaction.options.getString('group_id'));
            if (!groupId) return interaction.reply({ content: '❌ No pude reconocer el Group ID.', ephemeral: true });

            const db = cargarDB();
            const guildId = interaction.guild.id;
            if (!db[guildId]?.[groupId]) {
                return interaction.reply({ content: '❌ Ese grupo no está configurado en este servidor.', ephemeral: true });
            }
            const nombre = db[guildId][groupId].name || `Grupo ${groupId}`;
            delete db[guildId][groupId];
            guardarDB(db);
            return interaction.reply({ content: `✅ **${nombre}** (\`${groupId}\`) fue eliminado de la verificación.`, ephemeral: true });
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
                const gruposPublicos = await obtenerGruposPublicosUsuario(userId);
                const membresias = new Map();
                for (const item of gruposPublicos) {
                    const id = item.group?.id ?? item.id;
                    if (id !== undefined && id !== null) membresias.set(String(id), item);
                }

                for (const groupId of groupIds) {
                    const config = grupos[groupId];
                    const membership = membresias.get(String(groupId));
                    const grupo = membership?.group || {
                        id: groupId,
                        name: config.name || `Grupo ${groupId}`
                    };
                    resultados.push(crearResultado(grupo, config, Boolean(membership)));
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
        // TOP 10 COMPRADORES
        // ====================================================

        if (interaction.commandName === 'top') {
            const db = cargarDB();
            const guildData = db[interaction.guild.id] || {};
            const config = guildData.kaamstore || { usuarios: {} };
            const ranking = Object.entries(config.usuarios || {})
                .map(([id, datos]) => ({ id, robux: Number(datos.robuxTotales || 0), compras: Number(datos.compras || 0) }))
                .filter(x => x.robux > 0)
                .sort((a, b) => b.robux - a.robux)
                .slice(0, 10);

            if (!ranking.length) {
                return interaction.reply({ content: 'Todavía no hay compras registradas.', ephemeral: false });
            }

            const lineas = ranking.map((item, index) =>
                `**${index + 1}.** <@${item.id}> — ${ROBUX_EMOJI} **${formatearRobux(item.robux)} Robux** · ${item.compras} compra(s)`
            );
            const embed = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('🏆 Top 10 compradores de KaamStore')
                .setDescription(lineas.join('\n'))
                .setFooter({ text: 'Ranking por Robux comprados en este servidor' })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        // ====================================================
        // QUITAR COMPRA
        // ====================================================

        if (interaction.commandName === 'quitarcompra') {
            if (!esOwner(interaction)) {
                return interaction.reply({ content: '❌ Solo el Owner puede utilizar este comando.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            try {
                const usuario = interaction.options.getUser('usuario');
                const referencia = interaction.options.getString('referencia').trim();
                const db = cargarDB();
                const config = obtenerConfigKaamStore(db, interaction.guild.id);
                const datos = config.usuarios[usuario.id];
                if (!datos || !Array.isArray(datos.historial) || !datos.historial.length) {
                    return interaction.editReply('❌ Este cliente no tiene compras en el historial.');
                }
                const indice = datos.historial.findIndex(c => String(c.referencia).toLowerCase() === referencia.toLowerCase());
                if (indice === -1) {
                    return interaction.editReply('❌ No encontré esa referencia en el historial de ese cliente.');
                }
                const [eliminada] = datos.historial.splice(indice, 1);
                // Recalcular desde el historial evita descuadres y conserva el precio histórico.
                datos.robuxTotales = datos.historial.reduce((sum, c) => sum + Number(c.cantidad || 0), 0);
                datos.dineroGastado = Number(datos.historial.reduce((sum, c) => sum + Number(c.precio || 0), 0).toFixed(2));
                datos.compras = datos.historial.length;
                guardarDB(db);

                try {
                    await actualizarRoles(interaction.guild, usuario.id, datos.robuxTotales, config);
                } catch (roleError) {
                    console.error('❌ Error actualizando roles tras quitar compra:', roleError);
                }

                return interaction.editReply({ embeds: [new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('🗑️ Compra eliminada')
                    .setDescription(`Se eliminó la compra de **${usuario.tag}**.`)
                    .addFields(
                        { name: 'Referencia', value: `\`${eliminada.referencia}\``, inline: true },
                        { name: 'Robux eliminados', value: `${formatearRobux(Number(eliminada.cantidad || 0))}`, inline: true },
                        { name: 'Nuevo total', value: `${formatearRobux(datos.robuxTotales)} Robux`, inline: true }
                    )
                    .setFooter({ text: 'El perfil y el ranking se actualizaron con el historial restante.' })
                    .setTimestamp()] });
            } catch (error) {
                console.error('❌ ERROR QUITARCOMPRA:', error);
                return interaction.editReply('❌ Ocurrió un error eliminando la compra.');
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
