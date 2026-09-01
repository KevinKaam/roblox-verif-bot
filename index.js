const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
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

const DATABASE_FILE = path.join(
    __dirname,
    "grupos_servidores.json"
);

// ============================================================
// CLIENTE
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// WEB SERVER PARA RENDER
// ============================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send(
        "🟢 GroupVerify está online."
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
            `🌐 Web server activo en puerto ${PORT}`
        );
    }
);

// ============================================================
// CONFIG CHECK
// ============================================================

console.log(
    "========================================"
);

console.log(
    "       GROUPVERIFY V3 INICIANDO"
);

console.log(
    "========================================"
);

if (!TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN no configurado."
    );
}

if (!CLIENT_ID) {
    console.error(
        "❌ CLIENT_ID no configurado."
    );
}

if (!ENCRYPTION_SECRET) {
    console.error(
        "❌ ENCRYPTION_SECRET no configurado."
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
            "❌ Error leyendo base de datos:",
            error
        );

        return {};
    }
}

function guardarDB(data) {

    fs.writeFileSync(
        DATABASE_FILE,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );
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
// GROUP ID
// ============================================================

function extraerGroupId(input) {

    if (!input) {
        return null;
    }

    const texto =
        input.trim();

    // ID directo
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // URL
    const match =
        texto.match(
            /groups\/(\d+)/i
        );

    if (match) {
        return match[1];
    }

    // Último intento: cualquier número
    const numero =
        texto.match(/\d+/);

    return numero
        ? numero[0]
        : null;
}

// ============================================================
// ROBLOX: OBTENER USUARIO
// ============================================================

async function obtenerUserId(input) {

    const texto =
        input.trim();

    // ID
    if (
        /^\d+$/.test(texto)
    ) {
        return texto;
    }

    // URL de perfil
    const urlMatch =
        texto.match(
            /roblox\.com\/users\/(\d+)/i
        );

    if (urlMatch) {
        return urlMatch[1];
    }

    // Username
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
// ROBLOX OPEN CLOUD
// OBTENER GRUPO
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
            `❌ Open Cloud Get Group ${groupId}:`,
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
// ROBLOX OPEN CLOUD
// OBTENER MEMBRESÍA
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
            `❌ Membership ${groupId}/${userId}:`,
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

    const ahora =
        Date.now();

    const diferencia =
        ahora -
        fecha.getTime();

    return Math.max(
        0,
        Math.floor(
            diferencia /
            86400000
        )
    );
}

// ============================================================
// RESULTADO
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

    const diasRequeridos =
        config.dias;

    // ----------------------------------------
    // NO ESTÁ EN EL GRUPO
    // ----------------------------------------

    if (!membership) {

        return {

            groupId,

            nombre,

            link,

            unido: false,

            dias: null,

            requerido:
                diasRequeridos,

            elegible: false,

            icono: "🔴",

            texto:
                "sin unirse"
        };
    }

    // ----------------------------------------
    // ANTIGÜEDAD
    // ----------------------------------------

    const dias =
        calcularDias(
            membership.createTime
        );

    // ----------------------------------------
    // ANTIGÜEDAD NO DISPONIBLE
    // ----------------------------------------

    if (
        dias === null
    ) {

        return {

            groupId,

            nombre,

            link,

            unido: true,

            dias: null,

            requerido:
                diasRequeridos,

            elegible: false,

            icono: "🟡",

            texto:
                "miembro — antigüedad no disponible"
        };
    }

    // ----------------------------------------
    // ELEGIBLE
    // ----------------------------------------

    if (
        dias >=
        diasRequeridos
    ) {

        return {

            groupId,

            nombre,

            link,

            unido: true,

            dias,

            requerido:
                diasRequeridos,

            elegible: true,

            icono: "🟢",

            texto:
                `elegible — ${dias}d en el grupo`
        };
    }

    // ----------------------------------------
    // NO CUMPLE ANTIGÜEDAD
    // ----------------------------------------

    const faltan =
        diasRequeridos -
        dias;

    return {

        groupId,

        nombre,

        link,

        unido: true,

        dias,

        requerido:
            diasRequeridos,

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

    let lista =
        "";

    for (
        const resultado
        of resultados
    ) {

        lista +=
            `${resultado.icono} **${resultado.nombre}**`;

        lista +=
            ` — ${resultado.texto}`;

        lista +=
            "\n";
    }

    const embed =
        new EmbedBuilder()
            .setColor(color)

            .setTitle(
                titulo
            )

            .setDescription(
                `🆔 **ID:** \`${userId}\`\n` +
                `🔗 [Ver perfil de Roblox](https://www.roblox.com/users/${userId}/profile)`
            )

            .addFields({

                name:
                    "📋 Resultado de la verificación",

                value:
                    `🟢 **${elegibles}** elegible(s) • ` +
                    `🔴 **${restantes}** restante(s)`
            })

            .addFields({

                name:
                    "🏢 Grupos autorizados",

                value:
                    lista ||
                    "No hay grupos configurados."
            })

            .setFooter({

                text:
                    "GroupVerify • Roblox Open Cloud"
            })

            .setTimestamp();

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

    let cantidad =
        0;

    for (
        const resultado
        of resultados
    ) {

        if (
            cantidad === 5
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
            "🔑 Cómo conectar un grupo de Roblox"
        )

        .setDescription(
            "Para verificar miembros y calcular su antigüedad, GroupVerify utiliza Roblox Open Cloud."
        )

        .addFields(

            {

                name:
                    "1️⃣ Abre Creator Dashboard",

                value:
                    "[Abrir API Keys de Roblox](https://create.roblox.com/dashboard/credentials)"
            },

            {

                name:
                    "2️⃣ Crea una API Key",

                value:
                    "Pulsa **Create API Key**."
            },

            {

                name:
                    "3️⃣ Selecciona Group",

                value:
                    "En los permisos de la Key añade el sistema **Group**."
            },

            {

                name:
                    "4️⃣ Usa Read",

                value:
                    "El bot solamente necesita consultar información del grupo y sus membresías. No necesita permisos para expulsar, modificar roles ni administrar miembros."
            },

            {

                name:
                    "5️⃣ Asegúrate de tener acceso",

                value:
                    "La cuenta que creó la API Key debe tener los permisos necesarios sobre el grupo. Roblox determina el acceso de la Key según los permisos de su propietario."
            },

            {

                name:
                    "6️⃣ Copia la API Key",

                value:
                    "⚠️ **No la publiques ni la envíes por Discord.** Solo introdúcela directamente en `/addgroup`."
            },

            {

                name:
                    "7️⃣ Añade el grupo",

                value:
                    "`/addgroup group_id:123456 api_key:TU_KEY dias:3 verificado:si`"
            },

            {

                name:
                    "⭐ Reglas",

                value:
                    "🟢 `verificado: si` → **3 días**\n" +
                    "🔴 `verificado: no` → **15 días**"
            },

            {

                name:
                    "💡 ¿Qué comprobará el bot?",

                value:
                    "👤 Si el usuario pertenece al grupo\n" +
                    "📅 Cuántos días lleva dentro\n" +
                    "✅ Si cumple la antigüedad requerida"
            }
        )

        .setFooter({
            text:
                "GroupVerify • Tutorial"
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
            `✅ Bot conectado como ${client.user.tag}`
        );

        const commands = [

            // --------------------------------------------
            // USER
            // --------------------------------------------

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
                                "Username, ID o URL del perfil"
                            )

                            .setRequired(
                                true
                            )
                ),

            // --------------------------------------------
            // ADD GROUP
            // --------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "addgroup"
                )

                .setDescription(
                    "Añade un grupo de Roblox"
                )

                .setDefaultMemberPermissions(
                    PermissionFlagsBits.ManageGuild
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
                                "3 para verificado / 15 para no verificado"
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
                                "¿Grupo verificado?"
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

            // --------------------------------------------
            // TUTORIAL
            // --------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "tutorial"
                )

                .setDescription(
                    "Tutorial para configurar una API Key"
                )

        ].map(
            command =>
                command.toJSON()
        );

        const rest =
            new REST({
                version: "10"
            }).setToken(
                TOKEN
            );

        try {

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
                "✅ Comandos registrados correctamente."
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

            return interaction.reply({

                embeds: [
                    crearTutorial()
                ]
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
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {

                return interaction.reply({

                    content:
                        "❌ Necesitas **Gestionar servidor** para utilizar este comando.",

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

            // -----------------------------------------------
            // GROUP ID
            // -----------------------------------------------

            const groupId =
                extraerGroupId(
                    groupInput
                );

            if (!groupId) {

                return interaction.reply({

                    content:
                        "❌ No pude reconocer el Group ID. Puedes usar el número o la URL del grupo.",

                    ephemeral:
                        true
                });
            }

            // -----------------------------------------------
            // REGLAS
            // -----------------------------------------------

            if (
                verificado === "si" &&
                dias !== 3
            ) {

                return interaction.reply({

                    content:
                        "❌ Un grupo **verificado** debe tener exactamente **3 días**.",

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
                        "❌ Un grupo **no verificado** debe tener exactamente **15 días**.",

                    ephemeral:
                        true
                });
            }

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                console.log(
                    `🔎 Comprobando grupo ${groupId} con Open Cloud...`
                );

                // -------------------------------------------
                // AQUÍ ESTÁ EL CAMBIO PRINCIPAL DE V3
                // -------------------------------------------

                const grupo =
                    await obtenerGrupo(
                        groupId,
                        apiKey
                    );

                const nombre =
                    grupo.displayName ||
                    grupo.name ||
                    `Grupo ${groupId}`;

                // -------------------------------------------
                // GUARDAR
                // -------------------------------------------

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

                console.log(
                    `✅ Grupo guardado: ${nombre} (${groupId})`
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
                                `**${nombre}** fue añadido correctamente a GroupVerify.`
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
                                        "📅 Antigüedad",

                                    value:
                                        `**${dias} días**`,

                                    inline:
                                        true
                                }

                            )

                            .addFields({

                                name:
                                    "🔗 Grupo",

                                value:
                                    `https://www.roblox.com/groups/${groupId}`
                            })

                            .setFooter({

                                text:
                                    "API Key validada mediante Roblox Open Cloud"
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
                        "❌ **API Key inválida.** Roblox rechazó la clave (`401`)."
                    );
                }

                if (
                    error.message ===
                    "API_KEY_FORBIDDEN"
                ) {

                    return interaction.editReply(
                        "❌ **La API Key no tiene acceso a ese grupo.** Comprueba que la cuenta propietaria de la Key tenga permisos sobre el grupo y que la Key tenga `Group → Read`."
                    );
                }

                if (
                    error.message ===
                    "GROUP_NOT_FOUND"
                ) {

                    return interaction.editReply(
                        "❌ **Roblox no encontró ese grupo mediante Open Cloud.** Comprueba el Group ID y el acceso de la API Key."
                    );
                }

                if (
                    error.message ===
                    "ROBLOX_RATE_LIMIT"
                ) {

                    return interaction.editReply(
                        "⏳ Roblox está limitando temporalmente las peticiones. Espera un poco y vuelve a intentarlo."
                    );
                }

                if (
                    error.message ===
                    "ENCRYPTION_SECRET_MISSING"
                ) {

                    return interaction.editReply(
                        "❌ Falta `ENCRYPTION_SECRET` en Render."
                    );
                }

                console.error(
                    error
                );

                return interaction.editReply(
                    "❌ Ocurrió un error al conectar con Roblox Open Cloud. Revisa los logs de Render."
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

            await interaction.deferReply();

            const input =
                interaction.options.getString(
                    "usuario"
                );

            try {

                // -------------------------------------------
                // USER ID
                // -------------------------------------------

                const userId =
                    await obtenerUserId(
                        input
                    );

                if (!userId) {

                    return interaction.editReply(
                        "❌ No encontré ese usuario de Roblox."
                    );
                }

                // -------------------------------------------
                // DB
                // -------------------------------------------

                const db =
                    cargarDB();

                const guildId =
                    interaction.guild.id;

                const grupos =
                    db[guildId] || {};

                const groupIds =
                    Object.keys(
                        grupos
                    );

                if (
                    groupIds.length === 0
                ) {

                    return interaction.editReply(
                        "⚠️ Este servidor todavía no tiene grupos configurados. Usa `/addgroup`."
                    );
                }

                // -------------------------------------------
                // RESULTADOS
                // -------------------------------------------

                const resultados = [];

                // -------------------------------------------
                // CONSULTAR GRUPOS
                // -------------------------------------------

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

                    } catch (error) {

                        resultados.push({

                            groupId,

                            nombre:
                                config.name ||
                                `Grupo ${groupId}`,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido: false,

                            dias: null,

                            requerido:
                                config.dias,

                            elegible: false,

                            icono:
                                "⚠️",

                            texto:
                                "API Key ilegible"
                        });

                        continue;
                    }

                    try {

                        // -----------------------------------
                        // OBTENER GRUPO
                        // -----------------------------------

                        const grupo =
                            await obtenerGrupo(
                                groupId,
                                apiKey
                            );

                        // -----------------------------------
                        // OBTENER MEMBRESÍA
                        // -----------------------------------

                        const membership =
                            await obtenerMembresia(
                                groupId,
                                userId,
                                apiKey
                            );

                        // -----------------------------------
                        // RESULTADO
                        // -----------------------------------

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

                            unido: false,

                            dias: null,

                            requerido:
                                config.dias,

                            elegible: false,

                            icono:
                                "⚠️",

                            texto
                        });
                    }
                }

                // -------------------------------------------
                // EMBED
                // -------------------------------------------

                const embed =
                    crearEmbed(
                        userId,
                        resultados
                    );

                // -------------------------------------------
                // BOTONES
                // -------------------------------------------

                const botones =
                    crearBotones(
                        resultados
                    );

                return interaction.editReply({

                    embeds: [
                        embed
                    ],

                    components:
                        botones
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
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
    TOKEN
);
