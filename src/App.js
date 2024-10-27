import React, { useState } from 'react';
import { request, RpcErrorCode, AddressPurpose } from '@sats-connect/core';
import * as bitcoin from 'bitcoinjs-lib';

function App() {
    const [walletConnected, setWalletConnected] = useState(false);
    const [addresses, setAddresses] = useState([]);
    const [lpId, setLpId] = useState('');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000';

    const connectWallet = async () => {
        try {
            const params = {
                purposes: ['payment', 'ordinals'],
                message: 'Пожалуйста, подключите свой кошелек для подписания PSBT.'
            };

            const response = await request('getAccounts', params);

            console.log("getAccounts response:", response);
            if (response.status === 'success') {
                setAddresses(response.result);
                setWalletConnected(true);


            } else {
                if (response.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил запрос на подключение.");
                } else {
                    alert("Ошибка подключения кошелька: " + response.error.message);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Ошибка подключения кошелька: " + err.message);
        }
    };

    const handleLpIdChange = (e) => {
        setLpId(e.target.value);
    };


    const getAndSignPsbt = async () => {
        if (!walletConnected) {
            alert("Пожалуйста, сначала подключите кошелек.");
            return;
        }

        if (!lpId) {
            alert("Пожалуйста, введите ID launchpool.");
            return;
        }

        try {
            // Получение PSBT с API
            const psbtResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/${lpId}/psbt`, {
                headers: {
                    'accept': 'application/json'
                }
            });
            const psbtData = await psbtResponse.json();
            const psbtBase64 = psbtData.psbt;
            console.log(psbtData)
            // Подготовка signInputs


            // Декодируем PSBT из Base64 и получаем количество входов
            const decodedPsbt = bitcoin.Psbt.fromBase64(psbtBase64);
            const inputCount = decodedPsbt.inputCount;
            console.log(`Количество входов: ${inputCount}`);
            const signInputs = {};

            if (addresses.length === 0) {
                alert("Нет доступных адресов для подписания.");
                return;
            }

            // Получаем адрес для платежей
            const paymentAddressItem = addresses.find(
                (address) => address.purpose === AddressPurpose.Ordinals
            );

            if (!paymentAddressItem) {
                alert("Не удалось найти адрес для платежей.");
                return;
            }

            const address = paymentAddressItem.address;
            signInputs[address] = Array.from({ length: inputCount }, (_, index) => index);
            console.log(signInputs)

            // Подписание PSBT
            const signPsbtResponse = await request('signPsbt', {
                psbt: psbtBase64,
                signInputs: signInputs,
                allowedSighash: [1], // SIGHASH_ALL
            });

            if (signPsbtResponse.status === 'success') {
                const signedPsbt = signPsbtResponse.result.psbt;
                console.log(signedPsbt)
                // Отправка подписанного PSBT обратно на API
                const saveResponse = await fetch(`${API_BASE_URL}/psbt/v1/launchpads/save`, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        launchpadId: lpId,
                        signedListingPSBT: signedPsbt
                    })
                });
                const saveData = await saveResponse.json();
                console.log("Save response:", saveData);
                alert("PSBT успешно подписан и отправлен.");
            } else {
                if (signPsbtResponse.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил подписание PSBT.");
                } else {
                    alert("Ошибка подписания PSBT: " + signPsbtResponse.error.message);
                }
            }

        } catch (err) {
            console.error(err);
            alert("Произошла ошибка: " + err.message);
        }
    };

    function formatSignInputs(address, buyerInputIndices) {
        let signInputs = {};
        signInputs[address] = buyerInputIndices;
        return signInputs;
    }

    const getAndSignBuyPsbt = async () => {
        if (!walletConnected) {
            alert("Пожалуйста, сначала подключите кошелек.");
            return;
        }


        if (!lpId) {
            alert("Пожалуйста, введите ID фазы.");
            return;
        }

        try {

            if (addresses.length === 0) {
                alert("Нет доступных адресов для подписания.");
                return;
            }

            // Получаем адрес для платежей
            const paymentAddressItem = addresses.find(
                (address) => address.purpose === AddressPurpose.Payment,

            );
            console.log("paymentAddressItem", paymentAddressItem)

            const ordinalsAddressItem = addresses.find(
                (address) => address.purpose === AddressPurpose.Ordinals,
            );
            console.log("ordinalsAddressItem", ordinalsAddressItem)

            if (!paymentAddressItem) {
                alert("Не удалось найти адрес для платежей.");
                return;
            }

            // Получение PSBT с API
            const buyResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/buy-nft`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    launchpadId: lpId,
                    buyerOrdinalAddress: ordinalsAddressItem.address,
                    buyerPaymentAddress: paymentAddressItem.address,
                    buyerPaymentPublicKey: paymentAddressItem.publicKey
                })
            });
            const buyData = await buyResponse.json();

            const psbtBase64 = buyData.psbt;

            // Подготовка signInputs

            const paymentAddress = paymentAddressItem.address;
            const signInputs =  formatSignInputs(paymentAddress, buyData.buyerInputIndices);
            console.log(signInputs)
            // Подписание PSBT
            const signPsbtResponse = await request('signPsbt', {
                psbt: psbtBase64,
                signInputs: signInputs,
                allowedSighash: [1], // SIGHASH_ALL
            });

            if (signPsbtResponse.status === 'success') {
                const signedPsbt = signPsbtResponse.result.psbt;
                console.log(signedPsbt)
                //Отправка подписанного PSBT обратно на API
                const saveResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/submit-launch-offer`, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        launchpadId: lpId,
                        ordinalId: buyData.ordinalId,
                        signedBuyerPSBTBase64: signedPsbt
                    })
                });
                const saveData = await saveResponse.json();
                console.log("Save response:", saveData);
                alert("PSBT успешно подписан и отправлен.");
            } else {
                if (signPsbtResponse.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил подписание PSBT.");
                } else {
                    alert("Ошибка подписания PSBT: " + signPsbtResponse.error.message);
                }
            }

        } catch (err) {
            console.error(err);
            alert("Произошла ошибка: " + err.message);
        }
    };


    return (
        <div style={{ padding: '20px' }}>
            <h1>Xverse Wallet PSBT Signer</h1>
            {!walletConnected && (
                <button onClick={connectWallet}>Подключить кошелек</button>
            )}
            {walletConnected && (
                <div>
                    <p>Кошелек подключен.</p>
                    <div>
                        <label>ID лаунчпула: </label>
                        <input type="text" value={lpId} onChange={handleLpIdChange} />
                    </div>
                    <button onClick={getAndSignPsbt}>Получить и подписать PSBT</button>
                    <button onClick={getAndSignBuyPsbt}>Заминтить говна</button>

                </div>
            )}
        </div>
    );
}

export default App;
