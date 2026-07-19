"""load_progress.py — Thread-safe loading progress tracker.

Exposes a singleton ``progress_tracker`` consumed by the SSE endpoint
(``/api/system/loading-progress``) to stream real-time parse state to the UI.
"""

import threading
from typing import Dict, Any

class LoadProgressTracker:
    """Thread-safe tracker for the asynchronous database loading pipeline.

    Multiple parser threads call ``update()`` concurrently; all mutations are
    guarded by an internal ``threading.Lock``.  The UI polls ``get_snapshot()``
    via the SSE endpoint without blocking the parse threads.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.is_loading: bool = False
        self.current_db: str = ""
        self.progress: float = 0.0
        self.status: str = "Aguardando inicialização..."

    def start_loading(self, initial_db: str = "Iniciando...", status: str = "Iniciando engine de parse..."):
        """Resets state and marks loading as started.

        Args:
            initial_db: Display name of the first database being loaded.
            status: Human-readable status message for the UI.
        """
        with self._lock:
            self.is_loading = True
            self.current_db = initial_db
            self.progress = 0.0
            self.status = status

    def update(self, progress: float = None, current_db: str = None, status: str = None, is_loading: bool = None):
        """Partially updates one or more tracker fields atomically.

        Any argument left as ``None`` is left unchanged.

        Args:
            progress: New progress percentage; clamped to ``[0.0, 100.0]``.
            current_db: Display name of the database currently being parsed.
            status: Human-readable status message for the UI.
            is_loading: Explicit override for the loading flag.
        """
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
        """Marks loading as complete and sets progress to 100.

        Args:
            status: Final status message displayed to the user.
        """
        with self._lock:
            self.is_loading = False
            self.progress = 100.0
            self.current_db = "Concluído"
            self.status = status

    def get_snapshot(self) -> Dict[str, Any]:
        """Returns an atomic snapshot of the current tracker state.

        Returns:
            dict: ``{"is_loading": bool, "database": str, "progress": float, "status": str}``.
        """
        with self._lock:
            return {
                "is_loading": self.is_loading,
                "database": self.current_db,
                "progress": round(self.progress, 1),
                "status": self.status
            }

progress_tracker = LoadProgressTracker()
