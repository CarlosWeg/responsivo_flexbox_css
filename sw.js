// Service Worker para PostgreSQL Brasil PWA
const CACHE_NAME = 'postgresql-brasil-v1.0.0';
const STATIC_CACHE_NAME = 'postgresql-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'postgresql-dynamic-v1.0.0';

// Arquivos para cache estático (sempre em cache)
const staticAssets = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23336791"><path d="M23.111 5.441c-.248-2.135-1.735-3.928-3.797-4.584C17.678.375 15.99.057 14.269.057c-1.721 0-3.409.318-5.045.8C7.162 1.513 5.675 3.306 5.427 5.441c-.248 2.135.46 4.254 1.806 5.736.598.659 1.306 1.181 2.089 1.537v7.229c0 .829.672 1.5 1.5 1.5h4.356c.828 0 1.5-.671 1.5-1.5v-7.229c.783-.356 1.491-.878 2.089-1.537 1.346-1.482 2.054-3.601 1.806-5.736z"/></svg>'
];

// URLs que devem ser sempre buscadas da rede
const networkFirst = [
    '/api/',
    '/contact',
    '/form'
];

// Evento de instalação do Service Worker
self.addEventListener('install', event => {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Fazendo cache dos arquivos estáticos');
                return cache.addAll(staticAssets);
            })
            .then(() => {
                console.log('Service Worker: Instalação concluída');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Erro na instalação:', error);
            })
    );
});

// Evento de ativação do Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Ativando...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Remove caches antigos
                        if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                            console.log('Service Worker: Removendo cache antigo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Ativação concluída');
                return self.clients.claim();
            })
    );
});

// Evento de fetch - intercepta requisições de rede
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignora requisições que não são HTTP/HTTPS
    if (!request.url.startsWith('http')) {
        return;
    }
    
    // Estratégia Network First para APIs e formulários
    if (networkFirst.some(pattern => url.pathname.startsWith(pattern))) {
        event.respondWith(networkFirstStrategy(request));
        return;
    }
    
    // Estratégia Cache First para recursos estáticos
    if (request.destination === 'style' || 
        request.destination === 'script' || 
        request.destination === 'image' ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.json')) {
        event.respondWith(cacheFirstStrategy(request));
        return;
    }
    
    // Estratégia Stale While Revalidate para páginas HTML
    event.respondWith(staleWhileRevalidateStrategy(request));
});

// Estratégia Cache First - busca no cache primeiro, depois na rede
async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        // Adiciona ao cache dinâmico se a resposta for válida
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Cache First falhou:', error);
        return new Response('Conteúdo não disponível offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Estratégia Network First - busca na rede primeiro, depois no cache
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Atualiza o cache com a resposta da rede
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network First: Buscando no cache devido ao erro de rede');
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response('Conteúdo não disponível', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Estratégia Stale While Revalidate - retorna do cache e atualiza em segundo plano
async function staleWhileRevalidateStrategy(request) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Fetch da rede em paralelo
    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(error => {
        console.log('Stale While Revalidate: Erro na rede', error);
        return cachedResponse;
    });
    
    // Retorna do cache se disponível, senão espera pela rede
    return cachedResponse || fetchPromise;
}

// Evento de sincronização em segundo plano
self.addEventListener('sync', event => {
    console.log('Service Worker: Sincronização em segundo plano', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

// Função de sincronização em segundo plano
async function doBackgroundSync() {
    try {
        // Aqui você pode implementar lógica para sincronizar dados
        // quando a conectividade for restaurada
        console.log('Executando sincronização em segundo plano');
    } catch (error) {
        console.error('Erro na sincronização em segundo plano:', error);
    }
}

// Evento de push - para notificações push (futuro)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'PostgreSQL Brasil', {
                body: data.body || 'Você tem uma nova notificação',
                icon: '/icon-192.png',
                badge: '/badge-72.png',
                data: data.data || {},
                actions: [
                    {
                        action: 'open',
                        title: 'Abrir'
                    },
                    {
                        action: 'close',
                        title: 'Fechar'
                    }
                ]
            })
        );
    }
});

// Evento de clique em notificação
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Manipula erros do Service Worker
self.addEventListener('error', event => {
    console.error('Service Worker: Erro:', event.error);
});

// Manipula promessas rejeitadas não capturadas
self.addEventListener('unhandledrejection', event => {
    console.error('Service Worker: Promise rejeitada:', event.reason);
    event.preventDefault();
});

// Limpa caches antigos periodicamente
setInterval(() => {
    caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
            if (cacheName.includes('-v') && cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                console.log('Limpando cache antigo:', cacheName);
                caches.delete(cacheName);
            }
        });
    });
}, 24 * 60 * 60 * 1000); // A cada 24 horas