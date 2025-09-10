import sys
import os
from rag import get_chunks,final_lines_founded



query = sys.argv[1]
folder_path = sys.argv[2]

# Collect all .py files recursively
py_files = []

# RAG
def main():

    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.endswith('.py'):
                py_files.append(os.path.join(root, file))


    all_chunks = []
    for f in py_files:
        with open(f, "r", encoding="utf-8") as ff:
            source_code = ff.read()

        chunks = get_chunks(source_code)
        for chunk in chunks:
            chunk["filename"] = f

        all_chunks.extend(chunks)

    global query
    top_k_start_lines = final_lines_founded(query,all_chunks)


    #for line no, name, path in all_results:
    print(top_k_start_lines)
    pass



if __name__ == "__main__":
    main()