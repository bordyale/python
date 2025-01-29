from lib.functions import Sql_query

msg: str = "Michael,Alessio:Marco;Nicola,Micro"
print(msg.replace(";", ",").replace(":", ",").split(","))


def a():
    print("function A")


def b():
    print("function B")


def c():
    print("function C")


def d():
    print("function D")


def default():
    print("function default")


option = "b"
func = {"a": a, "b": b, "c": c, "d": d}
func.get(option, default)()

list1 = [1, 2, 3, 4, 5]
list2 = ["Alessio", "Ági", "mario", "Ivan", "pippO"]
dict1 = dict(zip(list1, list2))
print(f"Stampo dict1: {dict1}")
dict2 = {key: value for key, value in dict1.items()}
list3 = list(dict1.items())
list3.sort(key=lambda x: x[1])
print(f"Stampo list3: {list3}")
print(f"Stampo dict2: {dict2}")
l1, l2 = list(zip(*dict1.items()))
print(f"Stampo : {tuple(list(l1))} {l2}")
print(dir(dict2))
print(dir(list3))

sql = Sql_query("sql")
sql.sql

# class Person(object):
#     def __init__(self, name):
#         self.name = name
#         print("name:", name)
#
#     def __getattr__(self, item):
#         print("getattr:", item, self.name)
#
#
# c = Person("Alessio")
# c.ciao
# fw = open("exportOk.csv", "w")
# with open("VvOrderReportExport.csv", "r") as file:
#     line = file.readline()
#     while line:
#         uline = line.replace(chr(160), "")
#         print("linea:", line)
#         print("ulinea:", uline)
#         # uline = ' '.join(line.split())
#         linec = ""
#         for char in line:
#             linec = linec + f" {char}:{str(ord(char))}"
#         ulinec = ""
#         for char in uline:
#             ulinec = ulinec + " " + char + ":" + str(ord(char))
#         print("linec:", linec)
#         print("ulinec:", ulinec)
#         fw.write(uline)
#         fw.write("\n")
#         line = file.readline()
# fw.close()
# shop1 = {'name': 'Lidl', 'latte': 'Stg','succo': 'sabelli'}
# shop2 = {'name': 'Aldi', 'latte': 'Brescia','succo': 'trv'}
# shop3 = {'name': 'Auchan', 'latte': 'Centrale','succo': 'trv'}
# basket = {}
# for shop in (shop1,shop2,shop3):
#    name = shop.pop('name')
#    print(f'Shop name: {name}')
#    item = input('Insert item:')
#    basket.update({name: shop.get(item)})
#
# print(f'Basket: {basket.items()}')


## Python program to convert the currency
## of one country to that of another country
#
## Import the modules needed
# import requests
#
# class Currency_convertor:
# # empty dict to store the conversion rates
# rates = {}
# def __init__(self, url):
# data = requests.get(url).json()
#
# # Extracting only the rates from the json data
# self.rates = data["rates"]
#
# # function to do a simple cross multiplication between
# # the amount and the conversion rates
# def convert(self, from_currency, to_currency, amount):
# initial_amount = amount
# if from_currency != 'EUR' :
# amount = amount / self.rates[from_currency]
#
# # limiting the precision to 2 decimal places
# amount = round(amount * self.rates[to_currency], 2)
# print('{} {} = {} {}'.format(initial_amount, from_currency, amount, to_currency))
#
## Driver code
# if __name__ == "__main__":
#
# YOUR_ACCESS_KEY = 'c521e6ee31380fd5af9c42960b0c4763'
# url = str.__add__('http://data.fixer.io/api/latest?access_key=', YOUR_ACCESS_KEY)
# c = Currency_convertor(url)
# from_country = input("From Country: ")
# to_country = input("TO Country: ")
# amount = int(input("Amount: "))
#
# c.convert(from_country, to_country, amount)
