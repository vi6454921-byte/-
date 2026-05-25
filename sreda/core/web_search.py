from duckduckgo_search import DDGS
import logging

def search_web(query: str, max_results: int = 5) -> str:
    """Searches DuckDuckGo and returns formatted text results."""
    try:
        results_list = []
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            if not results:
                return f"Поиск по запросу '{query}' не дал результатов."
                
            for idx, r in enumerate(results, 1):
                title = r.get("title", "Без заголовка")
                body = r.get("body", "")
                href = r.get("href", "")
                results_list.append(f"{idx}. **{title}**\n{body}\nСсылка: {href}\n")
                
        return f"Результаты поиска по запросу '{query}':\n\n" + "\n".join(results_list)
    except Exception as e:
        logging.error(f"Search error: {e}")
        return f"Не удалось выполнить поиск в интернете. Ошибка: {str(e)}"
