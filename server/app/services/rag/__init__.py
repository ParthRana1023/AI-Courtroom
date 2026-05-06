async def delete_case_memory(*args, **kwargs):
    from app.services.rag.service import delete_case_memory as _delete_case_memory

    return await _delete_case_memory(*args, **kwargs)


async def index_case_memory(*args, **kwargs):
    from app.services.rag.service import index_case_memory as _index_case_memory

    return await _index_case_memory(*args, **kwargs)


async def retrieve_case_context(*args, **kwargs):
    from app.services.rag.service import retrieve_case_context as _retrieve_case_context

    return await _retrieve_case_context(*args, **kwargs)


async def upsert_memory_item(*args, **kwargs):
    from app.services.rag.service import upsert_memory_item as _upsert_memory_item

    return await _upsert_memory_item(*args, **kwargs)
