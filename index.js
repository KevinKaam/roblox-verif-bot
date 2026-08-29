const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ============================================================
// SERVIDOR WEB
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('¡Bot de verificación activo y en línea!');
});

app.listen(PORT, () => {
    console.log(`Servidor web interno corriendo en el puerto ${PORT}`);
});

// ============================================================
// CLIENTE DISCORD
// ============================================================

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ============================================================
// CONFIGURACIÓN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const ADMIN_ID = '1254918801569349676';

const dbPath = path.join(__dirname, 'grupos_servidores.json');

// Días mínimos necesarios para ser elegible
const DIAS_MINIMOS = 15;

// ============================================================
// BASE DE DATOS
// ============================================================

function cargarBaseDatos() {

    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(
            dbPath,
            JSON.stringify({}, null, 2)
        );
    }

    try {

        return JSON.parse(
            fs.readFileSync(dbPath, 'utf8')
        );

    } catch (error) {

        console.error('Error leyendo la base de datos:', error);

        return {};
    }
}

function guardarBaseDatos(data) {

    fs.writeFileSync(
        dbPath,
        JSON.stringify(data, null, 2)
    );
}

// ============================================================
// FORMATEAR ID
// ============================================================

function limpiarGroupId(input) {

    if (!input) return null;

    const match = input.match(/\d+/);

    return match ? match[0] : null;
}

// ============================================================
// OBTENER INFORMACIÓN DE GRUPO
// ============================================================

async function obtenerGrupo(groupId) {

    try {

        const response = await axios.get(
            `https://groups.roblox.com/v1/groups/${groupId}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            }
        );

        return response.data;

    } catch (error) {

        console.error(
            `Error obteniendo grupo ${groupId}:`,
            error.response?.status || error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER GRUPOS DEL USUARIO
// ============================================================

async function obtenerGruposUsuario(userId) {

    try {

        const response = await axios.get(
            `https://groups.roblox.com/v2/users/${userId}/groups/roles`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Cache-Control': 'no-cache'
                },
                timeout: 10000
            }
        );

        return response.data?.data || [];

    } catch (error) {

        console.error(
            `Error obteniendo grupos del usuario ${userId}:`,
            error.response?.status || error.message
        );

        return [];
    }
}

// ============================================================
// OBTENER USUARIO ROBLOX
// ============================================================

async function obtenerUsuario(userId) {

    try {

        const response = await axios.get(
            `https://users.roblox.com/v1/users/${userId}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            }
        );

        return response.data;

    } catch (error) {

        return null;
    }
}

// ============================================================
// OBTENER AVATAR
// ============================================================

async function obtenerAvatar(userId) {

    try {

        const response = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            }
        );

        return (
            response.data?.data?.[0]?.imageUrl ||
            'https://www.roblox.com/images/RobloxPlayer.png'
        );

    } catch (error) {

        return 'https://www.roblox.com/images/RobloxPlayer.png';
    }
}

// ============================================================
// OBTENER FECHA DE UNIÓN
// ============================================================
//
// IMPORTANTE:
// Roblox no expone actualmente la fecha de ingreso de forma
// pública mediante /v2/users/{userId}/groups/roles.
//
// Esta función intenta detectar cualquier campo de fecha que
// pudiera venir en respuestas compatibles, pero NO inventa
// ninguna fecha.
//
// ============================================================

function obtenerFechaUnion(groupData) {

    if (!groupData) {
        return null;
    }

    const posiblesCampos = [
        groupData.joined,
        groupData.joinedAt,
        groupData.created,
        groupData.memberSince,
        groupData.role?.joined,
        groupData.membership?.joinedAt
    ];

    for (const fecha of posiblesCampos) {

        if (!fecha) continue;

        const date = new Date(fecha);

        if (!isNaN(date.getTime())) {
            return date;
        }
    }

    return null;
}

// ============================================================
// CREAR ESTADO
// ============================================================

function crearEstadoGrupo({
    grupo,
    pertenece,
    esOwner,
    fechaUnion
}) {

    const nombre = grupo?.name || 'Grupo desconocido';

    const groupId = grupo?.id?.toString();

    const link = `https://www.roblox.com/groups/${groupId}`;

    // --------------------------------------------------------
    // OWNER
    // --------------------------------------------------------

    if (esOwner) {

        return {
            nombre,
            link,
            icono: '👑',
            estado: 'elegible',
            texto: 'Propietario del grupo',
            dias: null,
            cumple: true
        };
    }

    // --------------------------------------------------------
    // NO PERTENECE
    // --------------------------------------------------------

    if (!pertenece) {

        return {
            nombre,
            link,
            icono: '🔴',
            estado: 'sin unirse',
            texto: 'El usuario no pertenece al grupo',
            dias: null,
            cumple: false
        };
    }

    // --------------------------------------------------------
    // PERTENECE PERO SIN FECHA
    // --------------------------------------------------------

    if (!fechaUnion) {

        return {
            nombre,
            link,
            icono: '🟡',
            estado: 'miembro',
            texto: 'Miembro — antigüedad no disponible',
            dias: null,
            cumple: false
        };
    }

    // --------------------------------------------------------
    // CALCULAR DÍAS
    // --------------------------------------------------------

    const ahora = new Date();

    const diferencia =
        ahora.getTime() - fechaUnion.getTime();

    const dias = Math.floor(
        diferencia / (1000 * 60 * 60 * 24)
    );

    const cumple = dias >= DIAS_MINIMOS;

    return {
        nombre,
        link,
        icono: cumple ? '🟢' : '🟡',
        estado: cumple ? 'elegible' : 'no elegible',
        texto: cumple
            ? `${dias}d en el grupo`
            : `${dias}d en el grupo • faltan ${DIAS_MINIMOS - dias}d`,
        dias,
        cumple
    };
}

// ============================================================
// READY
// ============================================================

client.once('ready', async () => {

    console.log(
        `¡Bot activo como ${client.user.tag}!`
    );

    const commands = [

        new SlashCommandBuilder()
            .setName('user')
            .setDescription(
                'Verifica la antigüedad y estado en los grupos de Roblox'
            )
            .addStringOption(option =>
                option
                    .setName('user_input')
                    .setDescription(
                        'Nombre de usuario, ID o Link del perfil de Roblox'
                    )
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('addgroup')
            .setDescription(
                'Añade un grupo autorizado para la verificación'
            )
            .addStringOption(option =>
                option
                    .setName('group_id')
                    .setDescription(
                        'ID o Link del grupo de Roblox'
                    )
                    .setRequired(true)
            )

    ].map(command => command.toJSON());

    const rest = new REST({
        version: '10'
    }).setToken(TOKEN);

    try {

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log(
            'Comandos /user y /addgroup registrados correctamente.'
        );

    } catch (error) {

        console.error(
            'Error registrando comandos:',
            error
        );
    }
});

// ============================================================
// INTERACCIONES
// ============================================================

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    // ========================================================
    // /ADDGROUP
    // ========================================================

    if (interaction.commandName === 'addgroup') {

        if (
            interaction.user.id !== ADMIN_ID &&
            interaction.guild.ownerId !== interaction.user.id
        ) {

            return interaction.reply({
                content:
                    '❌ No tienes permisos para utilizar este comando.',
                ephemeral: true
            });
        }

        const inputGroup =
            interaction.options.getString('group_id');

        const groupId =
            limpiarGroupId(inputGroup);

        if (!groupId) {

            return interaction.reply({
                content:
                    '❌ ID o enlace de grupo inválido.',
                ephemeral: true
            });
        }

        // Comprobamos que el grupo realmente exista

        const grupo =
            await obtenerGrupo(groupId);

        if (!grupo) {

            return interaction.reply({
                content:
                    '❌ No pude encontrar ese grupo de Roblox. Comprueba el ID.',
                ephemeral: true
            });
        }

        const db = cargarBaseDatos();

        const guildId =
            interaction.guild.id;

        if (!db[guildId]) {
            db[guildId] = [];
        }

        if (!db[guildId].includes(groupId)) {

            db[guildId].push(groupId);

            guardarBaseDatos(db);
        }

        return interaction.reply({
            content:
                `✅ Grupo **${grupo.name}** añadido correctamente.\n\n` +
                `🆔 ID: \`${groupId}\`\n` +
                `🔗 https://www.roblox.com/groups/${groupId}`,
            ephemeral: true
        });
    }

    // ========================================================
    // /USER
    // ========================================================

    if (interaction.commandName === 'user') {

        await interaction.deferReply();

        const userInput =
            interaction.options
                .getString('user_input')
                .trim();

        try {

            // =================================================
            // BUSCAR USER ID
            // =================================================

            let userId = null;

            const matchId =
                userInput.match(/\d+/);

            if (
                /^\d+$/.test(userInput) ||
                (
                    matchId &&
                    userInput.includes('roblox.com/users/')
                )
            ) {

                userId =
                    matchId
                        ? matchId[0]
                        : null;

            } else {

                const searchRes =
                    await axios.post(
                        'https://users.roblox.com/v1/usernames/users',
                        {
                            usernames: [userInput],
                            excludeBannedUsers: true
                        },
                        {
                            headers: {
                                'User-Agent': 'Mozilla/5.0'
                            },
                            timeout: 10000
                        }
                    );

                if (
                    searchRes.data &&
                    searchRes.data.data &&
                    searchRes.data.data.length > 0
                ) {

                    userId =
                        searchRes.data.data[0].id.toString();
                }
            }

            // =================================================
            // USUARIO NO ENCONTRADO
            // =================================================

            if (!userId) {

                return interaction.editReply(
                    '❌ No se pudo encontrar ese usuario de Roblox.'
                );
            }

            // =================================================
            // INFORMACIÓN DEL USUARIO
            // =================================================

            const user =
                await obtenerUsuario(userId);

            if (!user) {

                return interaction.editReply(
                    '❌ No pude obtener la información de ese usuario.'
                );
            }

            const displayName =
                user.displayName || user.name;

            const username =
                user.name;

            const avatarUrl =
                await obtenerAvatar(userId);

            // =================================================
            // GRUPOS CONFIGURADOS
            // =================================================

            const db =
                cargarBaseDatos();

            const guildId =
                interaction.guild.id;

            const gruposPermitidos =
                db[guildId] || [];

            if (gruposPermitidos.length === 0) {

                return interaction.editReply(
                    '⚠️ Este servidor todavía no tiene grupos registrados.\n' +
                    'Utiliza `/addgroup` para añadir uno.'
                );
            }

            // =================================================
            // OBTENER TODOS LOS GRUPOS DEL USUARIO
            // =================================================

            const gruposUsuario =
                await obtenerGruposUsuario(userId);

            // =================================================
            // RESULTADOS
            // =================================================

            const resultados = [];

            for (const groupId of gruposPermitidos) {

                const grupo =
                    await obtenerGrupo(groupId);

                if (!grupo) {

                    resultados.push({

                        nombre: `Grupo ${groupId}`,

                        link:
                            `https://www.roblox.com/groups/${groupId}`,

                        icono: '⚠️',

                        estado: 'error',

                        texto:
                            'No se pudo consultar el grupo',

                        dias: null,

                        cumple: false
                    });

                    continue;
                }

                // ---------------------------------------------
                // BUSCAR GRUPO EN LOS GRUPOS DEL USUARIO
                // ---------------------------------------------

                const pertenencia =
                    gruposUsuario.find(
                        item =>
                            item.group &&
                            item.group.id.toString() ===
                                groupId.toString()
                    );

                // ---------------------------------------------
                // COMPROBAR OWNER
                // ---------------------------------------------

                let esOwner = false;

                if (
                    grupo.owner &&
                    grupo.owner.userId &&
                    grupo.owner.userId.toString() ===
                        userId.toString()
                ) {

                    esOwner = true;
                }

                // ---------------------------------------------
                // FECHA
                // ---------------------------------------------

                const fechaUnion =
                    obtenerFechaUnion(pertenencia);

                // ---------------------------------------------
                // ESTADO
                // ---------------------------------------------

                const resultado =
                    crearEstadoGrupo({
                        grupo,
                        pertenece: !!pertenencia,
                        esOwner,
                        fechaUnion
                    });

                resultados.push(resultado);
            }

            // =================================================
            // CONTADORES
            // =================================================

            const total =
                resultados.length;

            const elegibles =
                resultados.filter(
                    r => r.cumple
                ).length;

            const noElegibles =
                resultados.filter(
                    r => !r.cumple
                ).length;

            // =================================================
            // ESTADO GENERAL
            // =================================================

            let titulo;

            let color;

            if (elegibles === total) {

                titulo =
                    '🟢 Verificación completa';

                color =
                    0x57F287;

            } else if (elegibles > 0) {

                titulo =
                    '⚠️ Verificación parcial';

                color =
                    0xFEE75C;

            } else {

                titulo =
                    '🔴 Verificación fallida';

                color =
                    0xED4245;
            }

            // =================================================
            // TEXTO DE GRUPOS
            // =================================================

            let gruposTexto = '';

            for (const resultado of resultados) {

                gruposTexto +=
                    `${resultado.icono} **${resultado.nombre}**`;

                if (
                    resultado.estado === 'elegible'
                ) {

                    gruposTexto +=
                        ` — **${resultado.texto}**`;

                } else if (
                    resultado.estado === 'sin unirse'
                ) {

                    gruposTexto +=
                        ` — *sin unirse*`;

                } else if (
                    resultado.estado === 'no elegible'
                ) {

                    gruposTexto +=
                        ` — **${resultado.texto}**`;

                } else {

                    gruposTexto +=
                        ` — *${resultado.texto}*`;
                }

                gruposTexto += '\n';
            }

            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()

                    .setColor(color)

                    .setAuthor({
                        name:
                            `${titulo}`,
                        iconURL:
                            avatarUrl
                    })

                    .setTitle(
                        `${displayName}`
                    )

                    .setDescription(
                        `**@${username}**\n` +
                        `🆔 \`${userId}\` • ` +
                        `[Ver perfil](https://www.roblox.com/users/${userId}/profile)`
                    )

                    .setThumbnail(
                        avatarUrl
                    )

                    .addFields({

                        name:
                            `📋 Resultado de la verificación`,

                        value:
                            `🟢 **${elegibles}** elegible(s) • ` +
                            `⚪ **${noElegibles}** restante(s)`

                    })

                    .addFields({

                        name:
                            `🏢 Grupos autorizados`,

                        value:
                            gruposTexto ||
                            '*No hay grupos para mostrar.*'

                    })

                    .setFooter({

                        text:
                            `Roblox Verification • ${total} grupo(s) comprobado(s)`,

                        iconURL:
                            avatarUrl
                    })

                    .setTimestamp();

            // =================================================
            // BOTONES
            // =================================================

            const filas = [];

            let filaActual =
                new ActionRowBuilder();

            let cantidadBotones =
                0;

            for (const resultado of resultados) {

                if (
                    !resultado.link
                ) {
                    continue;
                }

                // Discord permite máximo 5 botones por fila

                if (cantidadBotones >= 5) {

                    filas.push(
                        filaActual
                    );

                    filaActual =
                        new ActionRowBuilder();

                    cantidadBotones = 0;
                }

                const boton =
                    new ButtonBuilder()

                        .setLabel(
                            resultado.nombre.length > 70
                                ? resultado.nombre.substring(0, 67) + '...'
                                : resultado.nombre
                        )

                        .setStyle(
                            ButtonStyle.Link
                        )

                        .setURL(
                            resultado.link
                        );

                filaActual.addComponents(
                    boton
                );

                cantidadBotones++;
            }

            if (
                cantidadBotones > 0
            ) {

                filas.push(
                    filaActual
                );
            }

            // =================================================
            // RESPUESTA
            // =================================================

            await interaction.editReply({

                embeds: [
                    embed
                ],

                components:
                    filas

            });

        } catch (error) {

            console.error(
                'ERROR /user:',
                error
            );

            await interaction.editReply(
                '❌ Ocurrió un error al consultar Roblox. Inténtalo nuevamente.'
            );
        }
    }
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
