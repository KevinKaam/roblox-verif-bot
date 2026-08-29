const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Si usas Glitch, estas credenciales las puedes jalar del archivo .env oculto
const TOKEN = process.env.DISCORD_TOKEN || 'AQUI_TU_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'AQUI_TU_CLIENT_ID';

// Almacén temporal de grupos permitidos por el dueño o ID autorizada
let gruposPermitidos = []; // Aquí puedes guardar las IDs de los grupos con /addgroup si lo manejas en memoria o JSON

client.once('ready', async () => {
    console.log(`¡Bot activo en la web como ${client.user.tag}!`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('user')
            .setDescription('Verifica los grupos de Roblox y los 15 días de antigüedad')
            .addStringOption(option => 
                option.setName('username')
                      .setDescription('Nombre de usuario de Roblox a consultar')
                      .setRequired(true)),
        new SlashCommandBuilder()
            .setName('addgroup')
            .setDescription('Añade un grupo autorizado para la verificación')
            .addStringOption(option =>
                option.setName('group_id')
                      .setDescription('ID o Link del grupo de Roblox')
                      .setRequired(true))
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Comandos /user y /addgroup registrados con éxito.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // 1. COMANDO /addgroup (Restringido al dueño o ID específica: 1254918801569349676)
    if (interaction.commandName === 'addgroup') {
        const userIdPermitido = '1254918801569349676';
        if (interaction.user.id !== userIdPermitido && interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
        }

        const inputGroup = interaction.options.getString('group_id');
        // Extraer solo los números por si meten el link completo
        const matchId = inputGroup.match(/\d+/);
        const groupId = matchId ? matchId[0] : null;

        if (!groupId) {
            return interaction.reply({ content: '❌ ID o link de grupo inválido.', ephemeral: true });
        }

        if (!gruposPermitidos.includes(groupId)) {
            gruposPermitidos.push(groupId);
        }

        return interaction.reply(`✅ ¡Grupo con ID **${groupId}** añadido correctamente a la lista de verificación!`);
    }

    // 2. COMANDO /user
    if (interaction.commandName === 'user') {
        await interaction.deferReply();
        const username = interaction.options.getString('username');

        try {
            // Buscar ID de Roblox por el nombre de usuario
            const userRes = await axios.post('https://users.roblox.com/v1/users/search', {
                keyword: username,
                limit: 1
            });

            if (!userRes.data.data || userRes.data.data.length === 0) {
                return interaction.editReply(`❌ No se encontró ningún usuario con el nombre **${username}** en Roblox.`);
            }

            const robloxUser = userRes.data.data[0];
            const userId = robloxUser.id;
            const displayName = robloxUser.requestedUsername || robloxUser.name;

            // Consultar los grupos del usuario en la API oficial
            const groupsRes = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
            const userGroups = groupsRes.data.data;

            if (gruposPermitidos.length === 0) {
                return interaction.editReply('⚠️ Todavía no se ha registrado ningún grupo con `/addgroup`. Pídele al dueño que añada uno.');
            }

            let descripcion = `**Usuario:** ${displayName} (ID: \`${userId}\`)\n\n`;

            // Revisar cada grupo que el dueño guardó
            gruposPermitidos.forEach(gId => {
                const pertenencia = userGroups.find(g => g.group.id.toString() === gId);
                
                if (pertenencia) {
                    const fechaUnido = new Date(pertenencia.joined);
                    const hoy = new Date();
                    const dias = Math.floor((hoy - fechaUnido) / (1000 * 60 * 60 * 24));
                    const cumple = dias >= 15;

                    descripcion += `📦 **Grupo ID:** \`${gId}\`\n`;
                    descripcion += `• **Nombre:** ${pertenencia.group.name}\n`;
                    descripcion += `• **Días en el grupo:** ${dias} días\n`;
                    descripcion += `• **Estado:** ${cumple ? '✅ **Apto para pagos (Más de 15 días)**' : `❌ **Faltan ${15 - dias} días**`}\n\n`;
                } else {
                    descripcion += `📦 **Grupo ID:** \`${gId}\`\n• ❌ *El usuario no está unido a este grupo.*\n\n`;
                }
            });

            const embed = new EmbedBuilder()
                .setTitle(`Reporte de Antigüedad: ${displayName}`)
                .setColor(0x0099FF)
                .setDescription(descripcion)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('Hubo un fallo conectando con la API de Roblox. Inténtalo de nuevo más tarde.');
        }
    }
});

client.login(TOKEN);