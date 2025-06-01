# Zadanie 2 - Docker

## Opis
Automatyczny workflow GitHub Actions do budowania, skanowania i publikowania obrazów Docker z obsługą multi-platform (AMD64/ARM64).

## Architektura rozwiązania
## 1. **Triggery workflow**
- **Tag push:** Automatyczne uruchomienie przy tworzeniu tagów `v*` (np. `v1.0.0`)
- **Manual dispatch:** Możliwość ręcznego uruchomienia z interfejsu GitHub

## 2. **Konfiguracja zmiennych środowiskowych**
```yml
IMAGE_CACHE: dockerhub_username/zadanie-2-docker:cache  # Cache w DockerHub
GHCR_IMAGE: ghcr.io/username/zadanie-2-docker          # Obraz docelowy w GHCR
IMAGE_SHA_TAG: ghcr.io/username/zadanie-2-docker:sha-{commit_hash}  # Tag dla skanowania
```

## 3. **Setup infrastruktury**
- **QEMU:** Emulacja architektur ARM64 na AMD64 runnerach
```yml
- name: Set up QEMU
        uses: docker/setup-qemu-action@v3
```
- **Docker Buildx:** Multi-platformowe budowanie
```yml
- name: Set up Buildx
        uses: docker/setup-buildx-action@v3
```
- **Metadata:** Automatyczne generowanie tagów i labeli
```yml
- name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{env.GHCR_IMAGE}}
          tags: |
            type=ref,event=tag
            type=sha
          labels: |
            org.opencontainers.image.title=zadanie-2-docker
            org.opencontainers.image.description=Docker image dla zadania 2
```

## 4. **Autoryzacja**
- **GHCR:** Login przez GITHUB_TOKEN (repo secret)
```yml
- name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
```
- **DockerHub:** Login przez DOCKERHUB_TOKEN (repo secret)
```yml
- name: Log in to DockerHub (for cache)
        uses: docker/login-action@v3
        with:
          username: ${{ vars.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
```

## 5. **Dwuetapowy build**
### Etap 1: Build lokalny + skanowanie CVE
- **Cache źródłowy:** Pobierany z DockerHub (`IMAGE_CACHE`)
- **Jeśli nie istnieje** (pierwszy build), buduje od zera.
- **Jeśli istnieje** – wykorzystuje zachowane warstwy.
- **Buduje obraz dla linux/amd64** w trybie czysto lokalnym:
    - `push: false` - nie publikuje w rejestrze
    - `load: true` - ładuje zbudowany obraz do lokalnego docker daemon na runnerze
- **Zapisuje wszystkie warstwy** do cache (tryb max).
```yml
- name: Build Docker image (local only for scan)
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64
          push: false
          load: true
          tags: ${{env.IMAGE_SHA_TAG}}
          cache-from: type=registry,ref=${{ env.IMAGE_CACHE }}
          cache-to: type=registry,ref=${{ env.IMAGE_CACHE }},mode=max
```

**Skanowanie Trivy:**
- Wykrywa krytyczne i wysokie podatności CVE
- Jeśli skanowanie przejdzie przechodzi do następnego etapu.

```yml
- name: CVE scan with Trivy
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: ${{env.IMAGE_SHA_TAG}}
          format: table
          exit-code: 1
          severity: CRITICAL,HIGH
```

### Etap 2: Multi-platform build + push
- **Ponownie używa cache** z DockerHub.
- **Buduje dla AMD64 + ARM64**, ale tylko zmienione warstwy dla poszczególnej architektury.
- **Pushuje gotowy obraz** do GHCR z odpowiednimi tagami (wersja + SHA).
- **Cache został już zapisany** – mimo że dotyczył tylko jednej architektury (AMD64), wspólne warstwy bazowe są identyczne dla AMD64 i ARM64. Dlatego w tym miejscu nie ma `cache-to`

```yml
- name: Build and push multi-architecture image (only if scan passed)
        if: success()
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64,linux/arm64
          push: true
          cache-from: type=registry,ref=${{ env.IMAGE_CACHE }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

## Rezultat:
- **Multi-platform image** w GitHub Container Registry
- **Tagi:** v1.0.0, sha-abc123
- **CVE scanning** zapewnia bezpieczeństwo
- **Registry cache** przyspiesza kolejne buildy

## Uzasadnienie wyborów
### Tagowanie obrazów
**Tagowanie semantyczne (Semantic Versioning):**
Koncepcja wersji MAJOR.MINOR.PATCH. System tagowania obrazów Docker wykorzystuje Semantic Versioning (SemVer) zgodnie ze specyfikacją [semver.org](https://semver.org/):

1. **MAJOR wersja (X.0.0)** - zwiększana przy niezgodnych zmianach w API
- Przykład: `v2.0.0` oznacza zmianę, która wymaga modyfikacji od aplikacji korzystających z obrazu

2. **MINOR wersja (0.Y.0)** - zwiększana przy dodaniu funkcjonalności w sposób wstecznie kompatybilny
- Przykład: `v1.3.0` oznacza nowe funkcje, ale zachowanie istniejących się nie zmienia

3. **PATCH wersja (0.0.Z)** - zwiększana przy poprawkach błędów zachowujących kompatybilność
- Przykład: `v1.0.4` oznacza poprawki bezpieczeństwa lub krytyczne bugfixy

**Zalety tego podejścia:**
- **Automatyzacja** - automatyczne tagowanie vX.Y.Z na podstawie Git tags (np. v1.0.0). 
- **Przewidywalność** - użytkownicy wiedzą czego się spodziewać po zmianie wersji

**Tagowanie SHA commitów:**

Każdy build jest oznaczany unikalnym tagiem zawierającym skrót SHA commitów Git w formacie:
```
sha-<pełny_sha_commita>
```
np. `sha-6c6e348`

Użycie Git commit SHA jako tagu gwarantuje, że każdy obraz będzie jednoznacznie zidentyfikowany na podstawie dokładnego stanu kodu źródłowego. Tagi SHA nie są czytelne dla człowieka, dlatego zostało użyte również tagowanie semantyczne.

### Zarządzanie cache
Cache w DockerHub:
- Wykorzystanie dedykowanego obrazu cache (username/zadanie-2-docker:cache)

![Image](https://github.com/user-attachments/assets/9bb2f7f1-a5b5-456b-89f4-16f0d7e538f2)

- Tryb `mode=max` dla pełnej optymalizacji
- Cache współdzielony między różnymi architekturami

Strategia cache według [docker docs cache optimize](https://docs.docker.com/build/cache/optimize/):
- Cache typu registry (zamiast lokalnego)
- `cache-from` do pobierania istniejących warstw
- `cache-to` do aktualizacji cache po buildzie