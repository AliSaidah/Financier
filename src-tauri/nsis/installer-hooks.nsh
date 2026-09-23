; Financier — NSIS post-install hook
; Recria o atalho da área de trabalho apontando explicitamente para o .ico
; para garantir que o ícone apareça corretamente sem depender do cache do Windows.

!macro NSIS_HOOK_POSTINSTALL
  ; Remove o atalho padrão criado pelo Tauri (que usa app.exe,0)
  Delete "$DESKTOP\Financier.lnk"
  ; Cria novo atalho com ícone explícito do arquivo .ico instalado
  CreateShortCut "$DESKTOP\Financier.lnk" "$INSTDIR\app.exe" "" "$INSTDIR\Financier.ico" 0
!macroend
