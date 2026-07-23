#!/bin/bash

set -e

cat << "EOF"
                               _           _          __  __ 
 _ __   ___  _ __  _ __  _   _( )___   ___| |_ _   _ / _|/ _|
| '_ \ / _ \| '_ \| '_ \| | | |// __| / __| __| | | | |_| |_ 
| |_) | (_) | |_) | |_) | |_| | \__ \ \__ \ |_| |_| |  _|  _|
| .__/ \___/| .__/| .__/ \__, | |___/ |___/\__|\__,_|_| |_|  
|_|         |_|   |_|    |___/                               

Hosted on vmlinuz.co.ke by poppy <3
--------------------------------------------------------------------------------------
EOF

echo "This script is only for LInux computers, for Windows, please use codefl0w's installer: https://github.com/codefl0w/mtkclient-windows-installer"
read -p "Proceed to installation [Y/N]: " choice < /dev/tty
case "$choice" in 
  y|Y ) ;;
  * ) echo "Aborted."; exit 1;;
esac

read -p "For sudo actions, it may require you to enter your password. Do you want to authenticate now? [Y/N]: " auth_choice < /dev/tty
case "$auth_choice" in
  y|Y ) sudo -v;;
  * ) ;;
esac

echo "Choose your distribution's package manager:"
echo "APT --> Ubuntu/Debian"
echo "Pacman --> ArchLinux"
echo "DNF --> Fedora"
read -p "Select package manager: " pkg_choice < /dev/tty

case "$pkg_choice" in
  [Aa][Pp][Tt]) PKG_MGR="apt"; INSTALL_CMD="sudo apt update && sudo apt install -y";;
  [Pp][Aa][Cc][Mm][Aa][Nn]) PKG_MGR="pacman"; INSTALL_CMD="sudo pacman -Sy --noconfirm";;
  [Dd][Nn][Ff]) PKG_MGR="dnf"; INSTALL_CMD="sudo dnf install -y";;
  *) echo "Invalid choice. Exiting."; exit 1;;
esac

DEPS=("git" "python3" "pip" "libusb-1.0-0")
if [ "$PKG_MGR" = "pacman" ]; then
  DEPS=("git" "python" "python-pip" "libusb")
elif [ "$PKG_MGR" = "dnf" ]; then
  DEPS=("git" "python3" "python3-pip" "libusb1")
fi

for dep in "${DEPS[@]}"; do
  if ! command -v "$dep" &> /dev/null && ! dpkg -s "$dep" &> /dev/null 2>&1; then
    echo "Dependency [$dep] is not installed."
    echo "Please install it now."
    read -p "Press Y to start installation: " dep_choice < /dev/tty
    echo "(If this is a false positive, your package manager will just throw an \"already installed\" nothing to worry about)"
    if [[ "$dep_choice" =~ ^[Yy]$ ]]; then
      $INSTALL_CMD "$dep"
    fi
  fi
done

echo ""
echo "CONFIGURE YOUR MTKCLIENT INSTALL"
echo ""

USE_PYENV=false
ADD_DESKTOP=false
USE_KAMAKIRI=false

read -p "Install pyenv (recommended to prevent PEP 668)? [Y/N]: " opt1 < /dev/tty
if [[ "$opt1" =~ ^[Yy]$ ]]; then
  USE_PYENV=true
  echo "--> Selected: Install pyenv"
fi

read -p "Add desktop icon (for mtk_gui)? [Y/N]: " opt2 < /dev/tty
if [[ "$opt2" =~ ^[Yy]$ ]]; then
  ADD_DESKTOP=true
  echo "--> Selected: Add desktop icon"
fi

read -p "Use kamakiri ( < MT6260 )? [Y/N]: " opt3 < /dev/tty
if [[ "$opt3" =~ ^[Yy]$ ]]; then
  USE_KAMAKIRI=true
  echo "--> Selected: Use kamakiri"
fi

echo ""
echo "The following changes have been added to your config:"
if [ "$USE_PYENV" = true ]; then
  echo "- Install pyenv (recommended to prevent PEP 668)"
else
  echo "- Using --break-system-packages flag for pip"
fi

if [ "$ADD_DESKTOP" = true ]; then
  echo "- Add desktop icon (for mtk_gui)"
fi

if [ "$USE_KAMAKIRI" = true ]; then
  echo "- Enable kamakiri setup"
fi

echo ""
read -p "Proceed to install? [Y/N] or press CTRL+C to abort: " final_choice < /dev/tty
case "$final_choice" in 
  y|Y ) ;;
  * ) echo "Aborted."; exit 1;;
esac

echo "Starting installation..."

if [ ! -d "mtkclient" ]; then
  git clone https://github.com/bkerler/mtkclient.git
fi
cd mtkclient

if [ "$USE_PYENV" = true ]; then
  if ! command -v pyenv &> /dev/null; then
    curl https://pyenv.run | bash
  fi
  export PATH="$HOME/.pyenv/bin:$PATH"
  eval "$(pyenv init -)"
  pyenv install -s 3.10.12
  pyenv local 3.10.12
  pip install -r requirements.txt
else
  pip3 install -r requirements.txt --break-system-packages || pip install -r requirements.txt --break-system-packages
fi

if [ "$USE_KAMAKIRI" = true ]; then
  git submodule update --init --recursive
fi

if ls Setup/Linux/*.rules 1> /dev/null 2>&1; then
  sudo cp Setup/Linux/*.rules /etc/udev/rules.d/
elif ls Setup/*.rules 1> /dev/null 2>&1; then
  sudo cp Setup/*.rules /etc/udev/rules.d/
fi
sudo udevadm control --reload-rules
sudo udevadm trigger

if [ "$ADD_DESKTOP" = true ]; then
  mkdir -p ~/.local/share/applications
  cat << EOF > ~/.local/share/applications/mtkclient.desktop
[Desktop Entry]
Type=Application
Name=MTK Client GUI
Exec=python3 $(pwd)/mtk_gui
Icon=$(pwd)/Setup/mtkclient.png
Terminal=false
Categories=Utility;
EOF
  chmod +x ~/.local/share/applications/mtkclient.desktop
fi

echo "Installation successfully completed!"
