from jproperties import Properties

def loadprops():
    configs = Properties()

    with open("app-config.properties", "rb") as config_file:
        configs.load(config_file, "utf-8")
        return configs
