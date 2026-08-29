const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('¡Bot de verificación activo y en línea!'));
app.listen(PORT, () => console.log(`Servidor web interno corriendo en el puerto ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_ID = '1254918801569349676';

const dbPath = path.join(__dirname, 'grupos_servidores.json');

function cargarBaseDatos() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try {
        return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function guardarBaseDatos(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

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
            .setDescription('Añade un grupo autorizado para la verificación en este servidor')
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
        if (interaction.user.id !== ADMIN_ID && interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
        }

        const inputGroup = interaction.options.getString('group_id');
        const matchId = inputGroup.match(/\d+/);
        const groupId = matchId ? matchId[0] : null;

        if (!groupId) {
            return interaction.reply({ content: '❌ ID o link de grupo inválido.', ephemeral: true });
        }

        let db = cargarBaseDatos();
        const guildId = interaction.guild.id;

        if (!db[guildId]) {
            db[guildId] = [];
        }

        if (!db[guildId].includes(groupId)) {
            db[guildId].push(groupId);
            guardarBaseDatos(db);
        }

        return interaction.reply({ content: `✅ ¡Grupo con ID **${groupId}** añadido correctamente a la lista de verificación de este servidor!`, ephemeral: true });
    }

    if (interaction.commandName === 'user') {
        await interaction.deferReply();
        let userInput = interaction.options.getString('user_input').trim();

        try {
            let userId = null;

            const matchId = userInput.match(/\d+/);
            if (/^\d+$/.test(userInput) || (matchId && userInput.includes('roblox.com/users/'))) {
                userId = matchId ? matchId[0] : null;
            } else {
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

            const userRes = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const displayName = userRes.data.displayName || userRes.data.name;
            const username = userRes.data.name;

            const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const avatarUrl = thumbRes.data.data[0]?.imageUrl || 'https://www.roblox.com';

            const db = cargarBaseDatos();
            const guildId = interaction.guild.id;
            const gruposPermitidos = db[guildId] || [];

            if (gruposPermitidos.length === 0) {
                return interaction.editReply('⚠️ Todavía no se ha registrado ningún grupo en este servidor usando `/addgroup`.');
            }

            const groupsRes = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0',
                    'Cache-Control': 'no-cache'
                }
            });
            const userGroups = groupsRes.data.data;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📊 Reporte de Verificación de Antigüedad`)
                .setThumbnail(avatarUrl)
                .setDescription(`**Perfil:** [${displayName} (@${username})](https://www.roblox.com/users/${userId}/profile)\n**ID:** \`${userId}\``)
                .setTimestamp();

            for (const gId of gruposPermitidos) {
                let pertenencia = userGroups.find(g => g.group.id.toString() === gId);
                let esOwner = false;
                let nombreGrupo = `Grupo ID: ${gId}`;
                let linkGrupo = `https://www.roblox.com/groups/${gId}`;

                try {
                    const groupInfoRes = await axios.get(`https://groups.roblox.com/v1/groups/${gId}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (groupInfoRes.data) {
                        nombreGrupo = groupInfoRes.data.name;
                        if (groupInfoRes.data.owner && groupInfoRes.data.owner.userId.toString() === userId) {
                            esOwner = true;
                        }
                    }
                } catch (e) {}

                if (esOwner) {
                    embed.addFields({
                        name: `👑 ${nombreGrupo}`,
                        value: `• **Link:** [Ir al grupo de Roblox](${linkGrupo})\n• **Estado:** ✅ **Apto para comprar en este grupo (Propietario)**`,
                        inline: false
                    });
                } else if (pertenencia && pertenencia.joined) {
                    const fechaUnido = new Date(pertenencia.joined);
                    const hoy = new Date();
                    
                    if (isNaN(fechaUnido.getTime())) {
                        embed.addFields({
                            name: `🧱 ${nombreGrupo}`,
                            value: `• **Link:** [Ir al grupo de Roblox](${linkGrupo})\n• ⚠️ *No se pudo calcular la fecha exacta de unión.*`,
                            inline: false
                        });
                        continue;
                    }

                    const dias = Math.floor((hoy - fechaUnido) / (1000 * 60 * 60 * 24));
                    const cumple = dias >= 15;

                    if (cumple) {
                        embed.addFields({
                            name: `🧱 ${nombreGrupo}`,
                            value: `• **Link:** [Ir al grupo de Roblox](${linkGrupo})\n• **Antigüedad:** \`${dias} días\`\n• **Estado:** ✅ **Apto para comprar en este grupo**`,
                            inline: false
                        });
                    } else {
                        const diasFaltantes = 15 - dias;
                        const fechaMeta = new Date(fechaUnido.getTime() + (15 * 24 * 60 * 60 * 1000));
                        const timestampUnix = Math.floor(fechaMeta.getTime() / 1000);

                        embed.addFields({
                            name: `🧱 ${nombreGrupo}`,
                            value: `• **Link:** [Ir al grupo de Roblox](${linkGrupo})\n• **Antigüedad actual:** \`${dias} días\`\n• **Faltan:** \`${diasFaltantes} días\` (Disponible <t:${timestampUnix}:R>)`,
                            inline: false
                        });
                    }
                } else {
                    embed.addFields({
                        name: `🧱 ${nombreGrupo}`,
                        value: `• **Link:** [Ir al grupo de Roblox](${linkGrupo})\n• ❌ *El usuario no se encuentra unido a este grupo (o Roblox está actualizando la lista).*`,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Ocurrió un error al consultar la API de Roblox. Inténtalo de nuevo más tarde.');
        }
    }
});

client.login(TOKEN);
