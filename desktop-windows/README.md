# Bir Artı Bir Windows

64 bit Windows 10 veya 11 üzerinde mevcut Bir Artı Bir sitesini açar. Ses odasına katıl, **Bas-konuş** kutusunu işaretle ve istersen tuşu değiştir. Varsayılan tuş **V**. Oyun öndeyken uygulamayı açık tut. Tuşu bırakınca mikrofon kapanır.

Windows tarafında harfler, rakamlar, F1–F24 ve yaygın gezinme tuşları desteklenir. Windows uygulaması site oturumunu kendi profilinde tutar. İlk mikrofon kullanımında izin sorar.

## Oyun göstergesi

Bir ses odasına bağlıyken başka bir pencereye geçince gösterge aktif pencerenin sol üstünde görünür. Odadaki kişileri, konuşanları ve mikrofonu kapalı olanları gösterir. **Ctrl+Shift+F10** veya **Görünüm → Oyun göstergesi** ile açıp kapatabilirsin. **Görünüm → Gösterge ayarları** bölümünde yazı boyutunu, soldan ve üstten boşluğu ve saydam arka planı ayarlayabilirsin. **Görünüm → Fareyle boyutlandır** ile pencerenin kenarını veya köşesini sürükle ve **Boyutu kaydet** düğmesine bas. Ayarlar Windows kullanıcısına göre kaydedilir. Oyun için pencereli veya kenarlıksız tam ekran kullan.

## Derleme

.NET 8 SDK ile `dotnet build -c Release` çalıştır. Ardından NSIS 3 ile `makensis installer.nsi` komutunu bu klasörde çalıştır. Derleme 64 bit Windows için .NET Framework 4.8 ve Microsoft WebView2 kullanır.

## Windows güncellemeleri

Uygulama açıldığında yeni sürümü kontrol eder. **Güncelleme → Güncellemeleri denetle** hem site arayüzünü yeniler hem Windows sürümünü kontrol eder. Ses odasındaysan arayüzü yenilemeden önce onay ister. Yeni sürüm varsa kurulum dosyasını indir ve kurmayı onayla.

Bir sürümü yayınlamak için Windows kurulum dosyasını Cloudflare Pages üzerindeki `desktop-update/` dizinine `BirArtiBir-Setup-Windows-x64-vMAJOR.MINOR.PATCH.exe` adıyla ekle. Aynı dağıtımda `latest.json` dosyasına sürümü (`Version`) ve kurulum dosyasının SHA-256 özetini (`Sha256`) yaz.
