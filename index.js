console.log("🔄 Intentando conectar KaamStore BOT a Discord...");

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN no existe.");
} else {
    console.log("✅ DISCORD_TOKEN detectado. Intentando iniciar sesión...");

    client.login(TOKEN)
        .then(() => {
            console.log("✅ Solicitud de conexión a Discord enviada.");
        })
        .catch((error) => {
            console.error("❌ ERROR CRÍTICO AL CONECTAR DISCORD:");
            console.error(error);
        });
}
