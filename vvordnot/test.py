msg: str ='Michael,Alessio:Marco;Nicola,Micro'
print(msg.replace(';',',').replace(':',',').split(','))
