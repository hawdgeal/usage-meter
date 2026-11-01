; Uninstall: remove the browser connection registered by the app (see src/register.js).
!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\fr.alencar.usage_meter"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\fr.alencar.usage_meter"
  DeleteRegKey HKCU "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\fr.alencar.usage_meter"
  DeleteRegKey HKCU "Software\Chromium\NativeMessagingHosts\fr.alencar.usage_meter"
  DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\fr.alencar.usage_meter"
!macroend
