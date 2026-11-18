# Bir Artı Bir müzik botu

YouTube bağlantısını ses odasındaki alana yapıştırıp **Botu çağır** düğmesine bas. Bot çağrının yapıldığı odaya gelir. Başka bir odadan geçerli bir çağrı geldiğinde önce eski odadan ayrılır, ardından yeni odada çalmaya başlar. **Durdur** düğmesini botun çaldığı odadaki kullanıcılar kullanabilir.

Yalnızca yayınlama hakkın olan içerikleri kullan. YouTube oynatmayı engellerse veya video uygun değilse arayüz hata gösterir. Her komut bir video açar ve çalma 30 dakikayla sınırlıdır.

## Kurulum

1. Dockerfile bağlamı olarak bu klasörü kullan. Canlı ortam için Docker konteynerini sürekli çalışan bir sunucuya **tek kopya** olarak dağıt. Yeni sürüm başlatılmadan önce eski konteyneri durdur. Sunucunun bot komutları için HTTPS adresi ve LiveKit Cloud ile YouTube'a çıkış erişimi olmalı.
2. Bot sunucusunda `LIVEKIT_URL`, `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` değişkenlerini siteyle aynı LiveKit projesine ayarla. Bot için yeni bir `MUSIC_BOT_SECRET` üret. Uygulama varsayılan olarak 8080 portunu kullanır.
3. Cloudflare Pages projesinde `MUSIC_BOT_URL` olarak bot sunucusunun HTTPS kök adresini, `MUSIC_BOT_SECRET` olarak aynı gizli değeri tanımla ve Pages'i yeniden dağıt. Anahtarları sunucu değişkeni olarak sakla.
4. İki tarayıcı oturumu aç. İkisini **Genel** odasına al ve ilkinden botu çağır. İkisi de müziği duymalı. Birini **Oyun** odasına taşı, oradan botu çağır ve müziğin yalnızca **Oyun** odasında devam ettiğini doğrula. Ardından mikrofon, yetkili susturma ve ban akışlarını bir deneme hesabıyla kontrol et.
