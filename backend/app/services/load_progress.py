import threading
from typing import Dict, Any

class LoadProgressTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self.is_loading: bool = False
        self.current_db: str = ""
        self.progress: float = 0.0
        self.status: str = "Aguardando inicialização..."

    def start_loading(self, initial_db: str = "Iniciando...", status: str = "Iniciando engine de parse..."):
        with self._lock:
            self.is_loading = True
            self.current_db = initial_db
            self.progress = 0.0
            self.status = status

    def update(self, progress: float = None, current_db: str = None, status: str = None, is_loading: bool = None):
        with self._lock:
            if progress is not None:
                self.progress = max(0.0, min(100.0, float(progress)))
            if current_db is not None:
                self.current_db = current_db
            if status is not None:
                self.status = status
            if is_loading is not None:
                self.is_loading = is_loading

    def finish_loading(self, status: str = "Carregamento Finalizado."):
        with self._lock:
            self.is_loading = False
            self.progress = 100.0
            self.current_db = "Concluído"
            self.status = status

    def get_snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "is_loading": self.is_loading,
                "database": self.current_db,
                "progress": round(self.progress, 1),
                "status": self.status
            }

progress_tracker = LoadProgressTracker()
