#!/bin/bash

set -e

LOG_START='\n\e[1;36m' # new line + bold + color
LOG_END='\n\e[0m' # new line + reset color

printf "${LOG_START}Configuring Tenderly...${LOG_END}"

touch $HOME/.tenderly/config.yaml

echo access_key: ${TENDERLY_API_KEY} > $HOME/.tenderly/config.yaml
