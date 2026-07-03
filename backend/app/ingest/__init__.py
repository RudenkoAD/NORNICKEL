"""Index Agent (ARCHITECTURE.md §4): офлайн-импорт документов в граф знаний.

Конвейер: parser → metadata → chunker → extractor (LLM) → validator → units →
canonizer → merger → embedder → writer. Числа парсит только код (инвариант №1).
"""
