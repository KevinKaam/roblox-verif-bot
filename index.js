const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN || 'AQUI_TU_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'AQUI_TU_CLIENT_ID';

let gruposPermitidos = [];

client.once('ready', async () => {
    console.log(`¡Bot activo en la web como ${client.user.tag}!`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('user')
            .setDescription('Verifica la antigüedad en los grupos de Roblox mediante ID o Link')
            .addStringOption(option => 
                option.setName('user_input')
                      .setDescription('ID de usuario de Roblox o Link de su perfil')
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

    if (interaction.commandName === 'addgroup') {
        const userIdPermitido = '1254918801569349676';
        if (interaction.user.id !== userIdPermitido && interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
        }

        const inputGroup = interaction.options.getString('group_id');
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

    if (interaction.commandName === 'user') {
        await interaction.deferReply();
        const userInput = interaction.options.getString('user_input');

        // Extraer los números del ID o link del perfil
        const matchId = userInput.match(/\d+/);
        const userId = matchId ? matchId[0] : null;

        if (!userId) {
            return interaction.editReply('❌ Por favor introduce un ID de usuario de Roblox válido o un enlace de perfil correcto.');
        }

        try {
            // Consultar datos del usuario directamente por su ID (100% funcional y sin bloqueos)
            const userRes = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            const displayName = userRes.data.displayName || userRes.data.name;
            const username = userRes.data.name;

            // Consultar los grupos del usuario
            const groupsRes = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });
            const userGroups = groupsRes.data.data;

            if (gruposPermitidos.length === 0) {
                return interaction.editReply('⚠️ Todavía no se ha registrado ningún grupo con `/addgroup`. Pídele al dueño que añada uno.');
            }

            let descripcion = `**Usuario:** ${displayName} (@${username}) (ID: \`${userId}\`)\n\n`;

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
            await interaction.editReply('❌ No se pudo encontrar ese usuario en Roblox o el ID es incorrecto.');
        }
    }
});

client.login(TOKEN);
