# Bir Artı Bir Windows

64 bit Windows 10 veya 11 üzerinde mevcut Bir Artı Bir sitesini açar. Ses odasına katıl, **Bas-konuş** kutusunu işaretle ve istersen tuşu değiştir. Varsayılan tuş **V**. Oyun öndeyken uygulamayı açık tut. Tuşu bırakınca mikrofon kapanır.

Windows tarafında harfler, rakamlar, F1–F24 ve yaygın gezinme tuşları desteklenir. Windows uygulaması site oturumunu kendi profilinde tutar. İlk mikrofon kullanımında izin sorar.

## Oyun göstergesi

Bir ses odasına bağlıyken başka bir pencereye geçince gösterge aktif pencerenin sol üstünde görünür. Odadaki kişileri, konuşanları ve mikrofonu kapalı olanları gösterir. **Görünüm → Oyun göstergesi** ile kapatabilirsin. Oyun için pencereli veya kenarlıksız tam ekran kullan.

## Derleme

.NET 8 SDK ile `dotnet build -c Release` çalıştır. Ardından NSIS 3 ile `makensis installer.nsi` komutunu bu klasörde çalıştır. Derleme 64 bit Windows için .NET Framework 4.8 ve Microsoft WebView2 kullanır.
