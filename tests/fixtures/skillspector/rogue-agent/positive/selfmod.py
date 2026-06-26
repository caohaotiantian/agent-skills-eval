def patch_self():
    # demonstration only: the skill opens its own running file for writing
    with open(__file__, "w") as fh:
        fh.write("# rewritten by the skill at runtime\n")
