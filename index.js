const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

let gruposPermitidos = [];

client.once('ready', async () => {
    console.log(`¡Bot activo en la web como ${client.user.tag}!`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('user')
            .setDescription('Verifica la antigüedad y estado en los grupos de Roblox')
            .addStringOption(option => 
                option.setName('user_input')
                      .setDescription('Nombre de usuario, ID o Link del perfil de Roblox')
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

        return interaction.reply({ content: `✅ ¡Grupo con ID **${groupId}** añadido correctamente a la lista de verificación!`, ephemeral: true });
    }

    if (interaction.commandName === 'user') {
        await interaction.deferReply();
        let userInput = interaction.options.getString('user_input').trim();

        try {
            let userId = null;

            // Detectar si es un enlace o contiene solo números (ID directo)
            const matchId = userInput.match(/\d+/);
            if (/^\d+$/.test(userInput) || (matchId && userInput.includes('roblox.com/users/'))) {
                userId = matchId ? matchId[0] : null;
            } else {
                // Si introdujo un nombre de usuario (ej: iKevs_Oficial), lo buscamos mediante la API oficial de Roblox
                // Nota: Usamos el endpoint de usuarios por nombre a través del método POST de usuarios
                const searchRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
                    usernames: [userInput],
                    excludeBannedUsers: true
                }, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                if (searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {
                    userId = searchRes.data.data[0].id.toString();
                }
            }

            if (!userId) {
                return interaction.editReply('❌ No se pudo encontrar ese usuario. Por favor introduce un nombre de usuario válido, ID o enlace de perfil.');
            }

            // Consultar datos principales del usuario
            const userRes = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const displayName = userRes.data.displayName || userRes.data.name;
            const username = userRes.data.name;

            // Obtener la cabeza/miniatura del avatar del usuario de Roblox
            const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const avatarUrl = thumbRes.data.data[0]?.imageUrl || 'https://www.roblox.com';

            // Consultar los grupos del usuario
            const groupsRes = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const userGroups = groupsRes.data.data;

            if (gruposPermitidos.length === 0) {
                return interaction.editReply('⚠️ Todavía no se ha registrado ningún grupo con `/addgroup`. Pídele al dueño que añada uno.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📊 Reporte de Verificación`)
                .setThumbnail(avatarUrl)
                .setDescription(`**Perfil:** [${displayName} (@${username})](https://www.roblox.com/users/${userId}/profile)\n**ID:** \`${userId}\``)
                .setTimestamp();

            gruposPermitidos.forEach(gId => {
                const pertenencia = userGroups.find(g => g.group.id.toString() === gId);
                
                if (pertenencia && pertenencia.joined) {
                    const fechaUnido = new Date(pertenencia.joined);
                    const hoy = new Date();
                    
                    if (isNaN(fechaUnido.getTime())) {
                        embed.addFields({
                            name: `📦 Grupo: ${pertenencia.group.name} (\`${gId}\`)`,
                            value: `⚠️ *No se pudo calcular la fecha exacta de unión.*`,
                            inline: false
                        });
                        return;
                    }

                    const dias = Math.floor((hoy - fechaUnido) / (1000 * 60 * 60 * 24));
                    const cumple = dias >= 15;

                    let estadoTexto = cumple 
                        ? `✅ **Apto para pagos** \`(${dias} días en el grupo)\`` 
                        : `❌ **No apto** \`(Faltan ${15 - dias} días - Tiene ${dias} días)\``;

                    embed.addFields({
                        name: `📦 ${pertenencia.group.name}`,
                        value: `• **ID del Grupo:** \`${gId}\`\n• **Estado:** ${estadoTexto}`,
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: `📦 Grupo ID: \`${gId}\``,
                        value: `• ❌ *El usuario no se encuentra unido a este grupo.*`,
                        inline: false
                    });
                }
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Ocurrió un error al consultar la API de Roblox. Inténtalo de nuevo más tarde.');
        }
    }
});

client.login(TOKEN);
