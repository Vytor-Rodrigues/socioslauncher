# Socios MC Launcher

Launcher desktop basico para Minecraft Java Edition original, feito em Electron.
Ele lista versoes oficiais, vincula uma conta Microsoft/Minecraft e instala/abre
o jogo usando os arquivos oficiais do Minecraft.

## O que foi implementado

- Lista de versoes pelo manifesto oficial:
  `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- Login Microsoft em janela segura separada, sem pedir senha dentro da UI do launcher.
- Troca de token Microsoft/Xbox/Minecraft Services via `msmc`.
- Validacao de perfil Minecraft Java antes de salvar a conta.
- Instalacao/download de cliente, assets, bibliotecas e natives via `minecraft-launcher-core`.
- Botao `Instalar` para baixar a versao sem iniciar o jogo.
- Botao `Jogar` para baixar o que faltar e iniciar Minecraft com a conta vinculada.
- Configuracao basica de memoria, tamanho da janela e caminho do Java.
- Logs com tokens mascarados.

## Como rodar

```powershell
npm install
npm start
```

## Como gerar instalador

```powershell
npm run dist
```

O instalador Windows sera gerado em `release/`.

## Dados locais

O launcher salva dados em `AppData/Roaming/SociosLauncher`:

- `account.json`: refresh token Microsoft e perfil publico do Minecraft.
- `settings.json`: memoria, Java e preferencias da UI.
- O jogo usa a pasta padrao do Minecraft Java:
  `AppData/Roaming/.minecraft`.
- Versoes instaladas em `.minecraft/versions` aparecem no launcher, incluindo
  versoes locais como Fabric, OptiFine e modpacks que tenham JSON de versao.
- `cache/`: cache de manifestos usados pelo launcher.

Para um produto final, troque o armazenamento simples de `account.json` por
Keychain/Credential Manager/DPAPI ou outro cofre do sistema operacional.

## Observacoes tecnicas

- O login usa OAuth Microsoft e a cadeia Xbox Live/XSTS/Minecraft Services.
- A biblioteca `minecraft-launcher-core` executa o download dos arquivos oficiais
  antes de iniciar o processo Java.
- Java precisa estar instalado. Este ambiente foi validado com Java 17.
- Algumas dependencias do ecossistema de launchers emitem avisos de pacote
  antigo/deprecated. Antes de publicar, vale auditar e acompanhar alternativas
  mantidas.

## Fontes usadas na pesquisa

- Microsoft OAuth device/auth flows:
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code
- Microsoft OAuth authorization code flow:
  https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Manifesto de versoes Java:
  https://minecraft.wiki/w/Version_manifest.json
- Pacote de autenticacao Microsoft/Minecraft:
  https://www.npmjs.com/package/msmc
- Core de launch/download Minecraft:
  https://www.npmjs.com/package/minecraft-launcher-core