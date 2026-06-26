def save(result):
    # legitimate: write to a designated output file, not the skill's own source
    with open("output.json", "w") as fh:
        fh.write(result)
