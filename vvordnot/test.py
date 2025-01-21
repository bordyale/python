msg: str ='Michael,Alessio:Marco;Nicola,Micro'
print(msg.replace(';',',').replace(':',',').split(','))

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

option ='b'
func = {'a': a, 'b': b, 'c': c, 'd':d}
print(type(func))

func.get(option,default)()
print(func.get(option,default))


msg1 = 'ciao'
msg2 = msg1
msg1 = 'prova'
print(msg1, msg2)
num1 = 1
num2 = num1
num2 = num2 + 1
print(num1,num2)




## Python program to convert the currency
## of one country to that of another country 
#
## Import the modules needed
#import requests
#
#class Currency_convertor:
#	# empty dict to store the conversion rates
#	rates = {} 
#	def __init__(self, url):
#		data = requests.get(url).json()
#
#		# Extracting only the rates from the json data
#		self.rates = data["rates"] 
#
#	# function to do a simple cross multiplication between 
#	# the amount and the conversion rates
#	def convert(self, from_currency, to_currency, amount):
#		initial_amount = amount
#		if from_currency != 'EUR' :
#			amount = amount / self.rates[from_currency]
#
#		# limiting the precision to 2 decimal places
#		amount = round(amount * self.rates[to_currency], 2)
#		print('{} {} = {} {}'.format(initial_amount, from_currency, amount, to_currency))
#
## Driver code
#if __name__ == "__main__":
#
#	YOUR_ACCESS_KEY = 'c521e6ee31380fd5af9c42960b0c4763'
#	url = str.__add__('http://data.fixer.io/api/latest?access_key=', YOUR_ACCESS_KEY) 
#	c = Currency_convertor(url)
#	from_country = input("From Country: ")
#	to_country = input("TO Country: ")
#	amount = int(input("Amount: "))
#
#	c.convert(from_country, to_country, amount)

