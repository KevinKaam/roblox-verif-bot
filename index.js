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

// IMPORTANTE:
// Se utiliza para cifrar las API Keys guardadas en el JSON.
const ENCRYPTION_SECRET =
    process.env.ENCRYPTION_SECRET;

const PORT =
    process.env.PORT || 3000;

const DATABASE_FILE =
    path.join(
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
// SERVIDOR WEB
// ============================================================

const app = express();

app.get("/", (req, res) => {

    res.status(200).send(
        "GroupVerify está online."
    );
});

app.get("/health", (req, res) => {

    res.json({
        online: true,
        bot: client.user
            ? client.user.tag
            : null,
        timestamp:
            new Date().toISOString()
    });
});

app.listen(
    PORT,
    () => {

        console.log(
            `🌐 Web activa en puerto ${PORT}`
        );
    }
);

// ============================================================
// VALIDACIÓN DE CONFIGURACIÓN
// ============================================================

console.log(
    "=========================================="
);

console.log(
    "       GROUPVERIFY INICIANDO"
);

console.log(
    "=========================================="
);

if (!TOKEN) {

    console.error(
        "❌ Falta DISCORD_TOKEN"
    );
}

if (!CLIENT_ID) {

    console.error(
        "❌ Falta CLIENT_ID"
    );
}

if (!ENCRYPTION_SECRET) {

    console.error(
        "❌ Falta ENCRYPTION_SECRET"
    );

    console.error(
        "⚠️ Las API Keys no pueden guardarse de forma segura."
    );
}

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
            JSON.stringify(
                {},
                null,
                2
            )
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
            "❌ Error leyendo JSON:",
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
        )
    );
}

// ============================================================
// CIFRADO DE API KEYS
// ============================================================

function obtenerClaveCifrado() {

    if (!ENCRYPTION_SECRET) {

        throw new Error(
            "ENCRYPTION_SECRET_MISSING"
        );
    }

    return crypto
        .createHash("sha256")
        .update(
            ENCRYPTION_SECRET
        )
        .digest();
}

function cifrarAPIKey(apiKey) {

    const key =
        obtenerClaveCifrado();

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
            apiKey,
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

function descifrarAPIKey(valor) {

    const key =
        obtenerClaveCifrado();

    const partes =
        valor.split(":");

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

    const encrypted =
        partes[1];

    const decipher =
        crypto.createDecipheriv(
            "aes-256-cbc",
            key,
            iv
        );

    let decrypted =
        decipher.update(
            encrypted,
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
// EXTRAER GROUP ID
// ============================================================

function obtenerGroupId(valor) {

    if (!valor) {

        return null;
    }

    const match =
        valor.match(/\d+/);

    return match
        ? match[0]
        : null;
}

// ============================================================
// BUSCAR USUARIO ROBLOX
// ============================================================

async function obtenerUserId(input) {

    const texto =
        input.trim();

    // --------------------------------------------------------
    // ID
    // --------------------------------------------------------

    if (
        /^\d+$/.test(texto)
    ) {

        return texto;
    }

    // --------------------------------------------------------
    // URL
    // --------------------------------------------------------

    const urlMatch =
        texto.match(
            /roblox\.com\/users\/(\d+)/i
        );

    if (urlMatch) {

        return urlMatch[1];
    }

    // --------------------------------------------------------
    // USERNAME
    // --------------------------------------------------------

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
                        10000,

                    headers: {
                        "User-Agent":
                            "GroupVerify/1.0"
                    }
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
            "❌ Error buscando usuario:",
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER GRUPO
// ============================================================

async function obtenerGrupo(
    groupId
) {

    try {

        const response =
            await axios.get(
                `https://groups.roblox.com/v1/groups/${groupId}`,

                {
                    timeout:
                        10000,

                    headers: {
                        "User-Agent":
                            "GroupVerify/1.0"
                    }
                }
            );

        return response.data;

    } catch (error) {

        console.error(
            `❌ Error obteniendo grupo ${groupId}:`,
            error.response?.status ||
            error.message
        );

        return null;
    }
}

// ============================================================
// CONSULTAR MEMBRESÍA
//
// IMPORTANTE:
// Cada grupo utiliza SU PROPIA API KEY.
// ============================================================

async function consultarMembresia(
    groupId,
    userId,
    apiKey
) {

    const url =
        `https://apis.roblox.com/cloud/v2/groups/${groupId}/memberships`;

    try {

        const response =
            await axios.get(
                url,

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
            response.data?.memberships ||
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

        const data =
            error.response?.data;

        console.error(
            `❌ Roblox Group ${groupId}:`,
            status,
            data || error.message
        );

        if (
            status === 401
        ) {

            throw new Error(
                "API_KEY_INVALID"
            );
        }

        if (
            status === 403
        ) {

            throw new Error(
                "API_KEY_FORBIDDEN"
            );
        }

        if (
            status === 404
        ) {

            throw new Error(
                "GROUP_NOT_FOUND"
            );
        }

        if (
            status === 429
        ) {

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
        isNaN(
            fecha.getTime()
        )
    ) {

        return null;
    }

    const diferencia =
        Date.now() -
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
// RESULTADO DE GRUPO
// ============================================================

function generarResultado(
    grupo,
    configuracion,
    membership
) {

    const groupId =
        grupo.id.toString();

    const nombre =
        grupo.name;

    const link =
        `https://www.roblox.com/groups/${groupId}`;

    const diasRequeridos =
        configuracion.dias;

    // --------------------------------------------------------
    // NO ESTÁ UNIDO
    // --------------------------------------------------------

    if (!membership) {

        return {

            groupId,

            nombre,

            link,

            unido:
                false,

            dias:
                null,

            requerido:
                diasRequeridos,

            elegible:
                false,

            icono:
                "🔴",

            texto:
                "sin unirse"
        };
    }

    // --------------------------------------------------------
    // CALCULAR ANTIGÜEDAD
    // --------------------------------------------------------

    const dias =
        calcularDias(
            membership.createTime
        );

    // --------------------------------------------------------
    // NO HAY CREATE TIME
    // --------------------------------------------------------

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

            requerido:
                diasRequeridos,

            elegible:
                false,

            icono:
                "🟡",

            texto:
                "miembro — antigüedad no disponible"
        };
    }

    // --------------------------------------------------------
    // ELEGIBLE
    // --------------------------------------------------------

    if (
        dias >=
        diasRequeridos
    ) {

        return {

            groupId,

            nombre,

            link,

            unido:
                true,

            dias,

            requerido:
                diasRequeridos,

            elegible:
                true,

            icono:
                "🟢",

            texto:
                `elegible — ${dias}d en el grupo`
        };
    }

    // --------------------------------------------------------
    // NO ALCANZA LOS DÍAS
    // --------------------------------------------------------

    const faltan =
        diasRequeridos -
        dias;

    return {

        groupId,

        nombre,

        link,

        unido:
            true,

        dias,

        requerido:
            diasRequeridos,

        elegible:
            false,

        icono:
            "🟡",

        texto:
            `miembro — ${dias}d en el grupo • faltan ${faltan}d`
    };
}

// ============================================================
// CREAR EMBED
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

    // --------------------------------------------------------
    // ESTADO
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // LISTA
    // --------------------------------------------------------

    let lista =
        "";

    for (
        const resultado
        of resultados
    ) {

        lista +=
            `${resultado.icono} **${resultado.nombre}**`;

        if (
            resultado.unido
        ) {

            lista +=
                ` — ${resultado.texto}`;

        } else {

            lista +=
                " — **sin unirse**";
        }

        lista +=
            "\n";
    }

    // --------------------------------------------------------
    // EMBED
    // --------------------------------------------------------

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
                "GroupVerify • Verificación automática"
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

    let contador =
        0;

    for (
        const resultado
        of resultados
    ) {

        if (
            contador >= 5
        ) {

            filas.push(
                fila
            );

            fila =
                new ActionRowBuilder();

            contador =
                0;
        }

        fila.addComponents(

            new ButtonBuilder()

                .setLabel(
                    resultado.nombre
                        .length > 70
                        ? resultado.nombre
                            .substring(
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

        contador++;
    }

    if (
        contador > 0
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

function crearTutorialEmbed() {

    return new EmbedBuilder()

        .setColor(
            0x5865F2
        )

        .setTitle(
            "🔑 Tutorial — API Key de Roblox"
        )

        .setDescription(
            "Para que el bot pueda comprobar si un usuario está en tu grupo y calcular cuántos días lleva, el propietario o administrador autorizado del grupo debe crear una API Key con permiso de lectura."
        )

        .addFields(

            {

                name:
                    "1️⃣ Entra a Creator Dashboard",

                value:
                    "[Abrir API Keys de Roblox](https://create.roblox.com/dashboard/credentials)"
            },

            {

                name:
                    "2️⃣ Crea una API Key",

                value:
                    "Pulsa **Create API Key** y ponle un nombre que puedas reconocer, por ejemplo `GroupVerify`."
            },

            {

                name:
                    "3️⃣ Añade el sistema Group",

                value:
                    "En **Access Permissions**, selecciona el sistema **Group**."
            },

            {

                name:
                    "4️⃣ Solo permiso de lectura",

                value:
                    "Selecciona únicamente la operación de lectura (**Read**). No necesitas permisos para modificar miembros."
            },

            {

                name:
                    "5️⃣ Configura el grupo",

                value:
                    "La API Key debe tener acceso al grupo que quieres verificar. No necesitas darle permisos innecesarios."
            },

            {

                name:
                    "6️⃣ Genera la Key",

                value:
                    "Guarda y genera la API Key. Roblox indica que la API Key funciona como una contraseña y debe mantenerse segura."
            },

            {

                name:
                    "7️⃣ Añade el grupo al bot",

                value:
                    "Usa:\n" +
                    "`/addgroup group_id:123456 api_key:TU_KEY dias:15 verificado:no`"
            },

            {

                name:
                    "⭐ Grupos verificados",

                value:
                    "Si el grupo es **verificado**, usa `verificado:si` y `dias:3`.\n\n" +
                    "Si NO es verificado, usa `verificado:no` y `dias:15`."
            },

            {

                name:
                    "⚠️ MUY IMPORTANTE",

                value:
                    "**Nunca publiques tu API Key.** Si alguien obtiene una API Key, puede utilizar los permisos que tenga esa clave. Roblox recomienda guardar las claves de forma segura y usar el mínimo de permisos necesario."
            }

        )

        .setFooter({

            text:
                "GroupVerify • Tutorial"
        })

        .setTimestamp();
}

// ============================================================
// READY
// ============================================================

client.once(
    "ready",
    async () => {

        console.log(
            `✅ Conectado como ${client.user.tag}`
        );

        const commands = [

            // ------------------------------------------------
            // /user
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
                                "Username, ID o link de Roblox"
                            )

                            .setRequired(
                                true
                            )
                ),

            // ------------------------------------------------
            // /addgroup
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "addgroup"
                )

                .setDescription(
                    "Añade un grupo de Roblox a la verificación"
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
                                "ID del grupo de Roblox"
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
                                "API Key de Roblox del grupo"
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
                                "Días requeridos: 3 o 15"
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

            // ------------------------------------------------
            // /tutorial
            // ------------------------------------------------

            new SlashCommandBuilder()

                .setName(
                    "tutorial"
                )

                .setDescription(
                    "Explica cómo crear la API Key de Roblox"
                )

        ].map(
            command =>
                command.toJSON()
        );

        const rest =
            new REST({
                version:
                    "10"
            })
            .setToken(
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
                "✅ Comandos registrados:"
            );

            console.log(
                "   /user"
            );

            console.log(
                "   /addgroup"
            );

            console.log(
                "   /tutorial"
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
        // /TUTORIAL
        // ====================================================

        if (
            interaction.commandName ===
            "tutorial"
        ) {

            return interaction.reply({

                embeds: [
                    crearTutorialEmbed()
                ]
            });
        }

        // ====================================================
        // /ADDGROUP
        // ====================================================

        if (
            interaction.commandName ===
            "addgroup"
        ) {

            // -----------------------------------------------
            // PERMISOS
            // -----------------------------------------------

            if (
                !interaction.memberPermissions
                    ?.has(
                        PermissionFlagsBits.ManageGuild
                    )
            ) {

                return interaction.reply({

                    content:
                        "❌ Necesitas el permiso **Gestionar servidor** para utilizar este comando.",

                    ephemeral:
                        true
                });
            }

            // -----------------------------------------------
            // DATOS
            // -----------------------------------------------

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
                obtenerGroupId(
                    groupInput
                );

            if (!groupId) {

                return interaction.reply({

                    content:
                        "❌ El Group ID no es válido.",

                    ephemeral:
                        true
                });
            }

            // -----------------------------------------------
            // VALIDAR DIAS
            // -----------------------------------------------

            if (
                verificado === "si" &&
                dias !== 3
            ) {

                return interaction.reply({

                    content:
                        "❌ Si `verificado` es **sí**, los días deben ser exactamente **3**.",

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
                        "❌ Si `verificado` es **no**, los días deben ser exactamente **15**.",

                    ephemeral:
                        true
                });
            }

            // -----------------------------------------------
            // API KEY
            // -----------------------------------------------

            if (
                !apiKey ||
                apiKey.length < 10
            ) {

                return interaction.reply({

                    content:
                        "❌ La API Key parece inválida.",

                    ephemeral:
                        true
                });
            }

            await interaction.deferReply({
                ephemeral:
                    true
            });

            try {

                // -------------------------------------------
                // COMPROBAR QUE EL GRUPO EXISTE
                // -------------------------------------------

                const grupo =
                    await obtenerGrupo(
                        groupId
                    );

                if (!grupo) {

                    return interaction.editReply(
                        "❌ No encontré ese grupo en Roblox."
                    );
                }

                // -------------------------------------------
                // COMPROBAR LA API KEY
                //
                // Se consulta el endpoint real del grupo.
                // Si funciona, la Key tiene acceso suficiente
                // para realizar la consulta.
                // -------------------------------------------

                await consultarMembresia(
                    groupId,
                    "1",
                    apiKey
                );

                // -------------------------------------------
                // CIFRAR API KEY
                // -------------------------------------------

                const encryptedKey =
                    cifrarAPIKey(
                        apiKey
                    );

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

                db[guildId][
                    groupId
                ] = {

                    groupId,

                    name:
                        grupo.name,

                    apiKey:
                        encryptedKey,

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

                // -------------------------------------------
                // RESPUESTA
                // -------------------------------------------

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0x57F287
                            )

                            .setTitle(
                                "✅ Grupo añadido correctamente"
                            )

                            .setDescription(
                                `**${grupo.name}** ya está configurado para la verificación.`
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
                                        "📅 Antigüedad requerida",

                                    value:
                                        `**${dias} días**`,

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
                                }

                            )

                            .setFooter({

                                text:
                                    "La API Key fue guardada cifrada."
                            })

                            .setTimestamp()
                    ]
                });

            } catch (error) {

                console.error(
                    "❌ Error /addgroup:",
                    error
                );

                if (
                    error.message ===
                    "API_KEY_INVALID"
                ) {

                    return interaction.editReply(
                        "❌ **API Key inválida.** Roblox rechazó la clave con `401 Unauthorized`."
                    );
                }

                if (
                    error.message ===
                    "API_KEY_FORBIDDEN"
                ) {

                    return interaction.editReply(
                        "❌ **La API Key no tiene permisos suficientes para ese grupo.** Revisa que el propietario haya añadido el sistema **Group** con permiso **Read** y que la clave tenga acceso a ese grupo."
                    );
                }

                if (
                    error.message ===
                    "ROBLOX_RATE_LIMIT"
                ) {

                    return interaction.editReply(
                        "⏳ Roblox está limitando las consultas temporalmente. Espera unos segundos y vuelve a intentarlo."
                    );
                }

                if (
                    error.message ===
                    "ENCRYPTION_SECRET_MISSING"
                ) {

                    return interaction.editReply(
                        "❌ Falta configurar `ENCRYPTION_SECRET` en el hosting."
                    );
                }

                return interaction.editReply(
                    "❌ No pude validar la API Key. Revisa la consola del bot."
                );
            }
        }

        // ====================================================
        // /USER
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

                // ------------------------------------------------
                // CONSULTAR CADA GRUPO
                // ------------------------------------------------

                for (
                    const groupId
                    of groupIds
                ) {

                    const configuracion =
                        grupos[
                            groupId
                        ];

                    const grupo =
                        await obtenerGrupo(
                            groupId
                        );

                    if (!grupo) {

                        resultados.push({

                            groupId,

                            nombre:
                                configuracion.name ||
                                `Grupo ${groupId}`,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido:
                                false,

                            dias:
                                null,

                            requerido:
                                configuracion.dias,

                            elegible:
                                false,

                            icono:
                                "⚠️",

                            texto:
                                "no se pudo consultar"
                        });

                        continue;
                    }

                    let apiKey;

                    try {

                        apiKey =
                            descifrarAPIKey(
                                configuracion.apiKey
                            );

                    } catch {

                        resultados.push({

                            groupId,

                            nombre:
                                grupo.name,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido:
                                false,

                            dias:
                                null,

                            requerido:
                                configuracion.dias,

                            elegible:
                                false,

                            icono:
                                "⚠️",

                            texto:
                                "API Key dañada o ilegible"
                        });

                        continue;
                    }

                    try {

                        const membership =
                            await consultarMembresia(
                                groupId,
                                userId,
                                apiKey
                            );

                        const resultado =
                            generarResultado(
                                grupo,
                                configuracion,
                                membership
                            );

                        resultados.push(
                            resultado
                        );

                    } catch (error) {

                        if (
                            error.message ===
                            "API_KEY_INVALID"
                        ) {

                            resultados.push({

                                groupId,

                                nombre:
                                    grupo.name,

                                link:
                                    `https://www.roblox.com/groups/${groupId}`,

                                unido:
                                    false,

                                dias:
                                    null,

                                requerido:
                                    configuracion.dias,

                                elegible:
                                    false,

                                icono:
                                    "⚠️",

                                texto:
                                    "API Key inválida"
                            });

                            continue;
                        }

                        if (
                            error.message ===
                            "API_KEY_FORBIDDEN"
                        ) {

                            resultados.push({

                                groupId,

                                nombre:
                                    grupo.name,

                                link:
                                    `https://www.roblox.com/groups/${groupId}`,

                                unido:
                                    false,

                                dias:
                                    null,

                                requerido:
                                    configuracion.dias,

                                elegible:
                                    false,

                                icono:
                                    "⚠️",

                                texto:
                                    "API Key sin permiso"
                            });

                            continue;
                        }

                        resultados.push({

                            groupId,

                            nombre:
                                grupo.name,

                            link:
                                `https://www.roblox.com/groups/${groupId}`,

                            unido:
                                false,

                            dias:
                                null,

                            requerido:
                                configuracion.dias,

                            elegible:
                                false,

                            icono:
                                "⚠️",

                            texto:
                                "error consultando Roblox"
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

                // -------------------------------------------
                // RESPUESTA
                // -------------------------------------------

                return interaction.editReply({

                    embeds: [
                        embed
                    ],

                    components:
                        botones
                });

            } catch (error) {

                console.error(
                    "❌ ERROR /user:",
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
