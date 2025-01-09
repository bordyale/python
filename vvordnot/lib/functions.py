#!/usr/bin/env python
# modified from http://elinux.org/RPi_Email_IP_On_Boot_Debian
import datetime
import smtplib
from email.mime.text import MIMEText

# import urllib2


def sendemail(msgstr):
    # Change to your own account information
    to = "alessio.bordignon@gmail.com"
    gmail_user = "system.bordignon@gmail.com"
    gmail_password = "dwqq fpef txem bgun"
    smtpserver = smtplib.SMTP("smtp.gmail.com", 587)
    smtpserver.ehlo()
    smtpserver.starttls()
    smtpserver.ehlo
    smtpserver.login(gmail_user, gmail_password)
    today = datetime.date.today()
    # Very Linux Specific
    # arg='ip route list'
    # p=subprocess.Popen(arg,shell=True,stdout=subprocess.PIPE)
    # data = p.communicate()
    # split_data = data[0].split()
    # ipaddr = split_data[split_data.index('src')+1]
    # extipaddr = urllib2.urlopen("http://icanhazip.com").read().decode('utf-8')

    msg = MIMEText(msgstr)
    msg["Subject"] = "IP For VFDeb on %s" % today.strftime("%b %d %Y")
    msg["From"] = gmail_user
    msg["To"] = to
    smtpserver.sendmail(gmail_user, [to], msg.as_string())
    smtpserver.quit()
    return "ok"
