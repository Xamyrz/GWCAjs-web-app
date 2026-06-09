{
    "activePropContext": 1852793632,
    "candidates": [
        {
            "eventBackReference": 13737776,
            "eventContextAddress": 13737944,
            "gameCandidates": [
                {
                    "gameContextAddress": 13737776,
                    "referenceSlotAddress": 13737820,
                    "charContext": {
                        "address": 13745536,
                        "nativeState": {
                            "currentMapId": 431,
                            "currentMapType": 0,
                            "districtId": 1,
                            "isExplorable": 0,
                            "language": 0,
                            "mapId": 431,
                            "observeMapId": 431,
                            "observeMapType": 0,
                            "playerNumber": 7,
                            "token1": 3722158087,
                            "token2": 1810800228,
                            "worldFlags": 200
                        },
                        "playerEmail": "12345@gmail.com",
                        "playerName": "Johny Bravo",
                        "playerUuidWords": [
                            2433965383,
                            1221376387,
                            3537904009,
                            2538760716
                        ]
                    },
                    "charContextAddress": 13745536,
                    "charPlayerNumber": 7,
                    "mapContextAddress": 112605392,
                    "reasons": [
                        "gameContext",
                        "char:isExplorable",
                        "char:language",
                        "char:currentMapId",
                        "char:observeMapId",
                        "char:currentMapId==observeMapId",
                        "char:currentMapType",
                        "char:observeMapType",
                        "char:districtId",
                        "char:playerNumber",
                        "world:worldPlayerNumber",
                        "world:playerArray",
                        "world:playerAgentId",
                        "world:playerStructNumber",
                        "world:controlledCompositeId",
                        "world:controlledAgentId"
                    ],
                    "rejection": null,
                    "score": 67,
                    "world": {
                        "controlledAgentId": 57,
                        "controlledCharAddress": 327778216,
                        "controlledCompositeId": 805306375,
                        "player": {
                            "address": 331178392,
                            "agentId": 57,
                            "playerNumber": 7
                        },
                        "playerAddress": 331178392,
                        "playerArrayAddress": 13742764,
                        "playerArrayHeader": {
                            "address": 13742764,
                            "buffer": 331177832,
                            "capacity": 11,
                            "size": 10,
                            "param": 3,
                            "bufferEnd": 331178712,
                            "bufferReasonable": true,
                            "slotCount": 11
                        },
                        "playerNumber": 7,
                        "reasons": [
                            "worldPlayerNumber",
                            "playerArray",
                            "playerAgentId",
                            "playerStructNumber",
                            "controlledCompositeId",
                            "controlledAgentId"
                        ],
                        "rejection": null,
                        "score": 41,
                        "worldContextAddress": 13740704
                    },
                    "worldContextAddress": 13740704
                }
            ],
            "mapContextAddress": 112605392,
            "propContextAddress": 13737776,
            "reasons": [
                "eventContextBackReference",
                "world:worldPlayerNumber",
                "world:playerArray",
                "world:playerAgentId",
                "world:playerStructNumber",
                "world:controlledCompositeId",
                "world:controlledAgentId",
                "mapContextPointer",
                "gameContextOwner"
            ],
            "rejection": null,
            "score": 72,
            "world": {
                "controlledAgentId": 57,
                "controlledCharAddress": 327778216,
                "controlledCompositeId": 805306375,
                "player": {
                    "address": 331178392,
                    "agentId": 57,
                    "playerNumber": 7
                },
                "playerAddress": 331178392,
                "playerArrayAddress": 13742764,
                "playerArrayHeader": {
                    "address": 13742764,
                    "buffer": 331177832,
                    "capacity": 11,
                    "size": 10,
                    "param": 3,
                    "bufferEnd": 331178712,
                    "bufferReasonable": true,
                    "slotCount": 11
                },
                "playerNumber": 7,
                "reasons": [
                    "worldPlayerNumber",
                    "playerArray",
                    "playerAgentId",
                    "playerStructNumber",
                    "controlledCompositeId",
                    "controlledAgentId"
                ],
                "rejection": null,
                "score": 41,
                "worldContextAddress": 13740704
            },
            "worldContextAddress": 13740704,
            "source": "directPropContextScan"
        }
    ],
    "propContextLayout": {
        "activeSlotAddress": 2667008,
        "eventContextOffset": 12,
        "eventPropContextOffset": 24,
        "readOnlyTableAddress": 2667012,
        "worldContextOffset": 44
    },
    "ranges": [
        {
            "start": 5349168,
            "end": 22126384
        }
    ],
    "rejected": [
        {
            "propContextAddress": 1852793632,
            "rejection": "prop-context-not-pointer",
            "source": "activePropContextSlot"
        },
        {
            "propContextAddress": 2667012,
            "rejection": "event-context-not-pointer",
            "source": "readOnlyPropContextTable"
        },
        {
            "propContextAddress": 19635452,
            "rejection": "world-context-invalid:world-player-number-invalid",
            "source": "directPropContextScan"
        },
        {
            "propContextAddress": 19635464,
            "rejection": "world-context-invalid:world-player-number-invalid",
            "source": "directPropContextScan"
        },
        {
            "propContextAddress": 19635488,
            "rejection": "world-context-invalid:world-player-number-invalid",
            "source": "directPropContextScan"
        }
    ],
    "scannedSlots": 4000001
}