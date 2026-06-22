# PC Configurator

Веб-конфигуратор для сборки персональных компьютеров.

## Технологии
- Backend: FastAPI + PostgreSQL + SQLAlchemy
- Frontend: HTML, CSS, Vanilla JS
- Парсер комплектующих (aiohttp + BeautifulSoup)

## Запуск 

cd Z:\projects\pc-configuration\backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000