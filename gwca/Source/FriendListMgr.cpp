#include "stdafx.h"

#include <GWCA/Utilities/Debug.h>
#include <GWCA/Utilities/Hooker.h>
#include <GWCA/Utilities/Macros.h>
#include <GWCA/Utilities/Scanner.h>

#include <GWCA/GameEntities/FriendsList.h>

#include <GWCA/Managers/Module.h>
#include <GWCA/Managers/FriendListMgr.h>
#include <GWCA/Managers/UIMgr.h>
#include <GWCA/Logger/Logger.h>

namespace {
    using namespace GW;

#pragma warning( push )
#pragma warning( disable : 4200)
    struct EventData {
        uint32_t event_id;
        uint32_t unk;
        uint32_t data_size;
        uint32_t data[];
    };
#pragma warning( pop ) 
    typedef void(__cdecl *FriendEventHandler_pt)(void*, EventData* event_info);
    FriendEventHandler_pt FriendEventHandler_Func = 0;
    FriendEventHandler_pt FriendEventHandler_Ret = 0;

    std::unordered_map<HookEntry*,FriendListMgr::FriendStatusCallback> FriendStatus_callbacks;

    void __cdecl OnFriendEventHandler(void* unk, EventData* event_info)
    {
        HookBase::EnterHook();
        uint8_t* uuid = 0;
        const wchar_t* alias = 0;
        switch (event_info->event_id) {
            // TODO: 0x27
        case 0x26: // Status change etc
            uuid = (uint8_t*)&event_info->data[2];
            alias = (wchar_t*)&event_info->data[6];
            break;
        case 0x28: // Location change
            alias = (wchar_t*)&event_info->data[0];
            break;
        case 0x2c: // Add/remove friend
            alias = (wchar_t*)&event_info->data[4];
            break;
        }
        if (!uuid && !alias) {
            FriendEventHandler_Ret(unk, event_info);
            HookBase::LeaveHook();
            return;
        }
        Friend* current_state = 0;
        bool uuid_valid = false;
        for (size_t i = 0; uuid && i < 16 && !uuid_valid; i++) {
            uuid_valid = uuid[i] != 0;
        }
        if (!uuid_valid)
            uuid = 0;
        if (!(alias && alias[0]))
            alias = 0;

        if (uuid) {
            current_state = FriendListMgr::GetFriend(uuid);
        }
        else if (alias) {
            current_state = FriendListMgr::GetFriend(alias,0,FriendType::Unknow);
        }

        HookStatus hook_status;
        
        Friend* old_state = 0;
        if (current_state) {
            old_state = (Friend*)malloc(sizeof(*old_state));
            GWCA_ASSERT(old_state && memcpy(old_state, current_state, sizeof(*old_state)));
        }

        // Forward call
        FriendEventHandler_Ret(unk, event_info);
        if (uuid) {
            current_state = FriendListMgr::GetFriend(uuid);
        }
        else if (alias) {
            current_state = FriendListMgr::GetFriend(alias,0,FriendType::Unknow);
        }

        for(auto it : FriendStatus_callbacks) {
            it.second(&hook_status, old_state, current_state);
            ++hook_status.altitude;
        }

        if (old_state)
            free(old_state);

        HookBase::LeaveHook();
    }

    typedef void(__cdecl *SetOnlineStatus_pt)(FriendStatus status);
    SetOnlineStatus_pt SetOnlineStatus_Func;

    // type:
    //  1 = Friend
    //  2 = Ignore
    typedef void (__cdecl *AddFriend_pt)(const wchar_t *name, const wchar_t *alias, FriendType type);
    AddFriend_pt AddFriend_Func;

    typedef void (__cdecl *RemoveFriend_pt)(const uint8_t *uuid, const wchar_t *name, uint32_t arg8);
    RemoveFriend_pt RemoveFriend_Func;

    uintptr_t FriendList_Addr;

    void Init() {
        //Logger::Instance().LogInfo("############ FriendListMgr initialization started ############");
        uintptr_t address = 0;

        address = Scanner::FindAssertion("FriendApi.cpp", "friendName && *friendName",0,0);
        if (address)
            address = Scanner::FindInRange("\x57\xb9", "xx", 2, address, address + 0xff);
        if (address && Scanner::IsValidPtr(*(uintptr_t*)address))
            FriendList_Addr = *(uintptr_t*)address;

        FriendEventHandler_Func = (FriendEventHandler_pt)Scanner::ToFunctionStart(Scanner::Find("\x83\xc0\xda\x83\xf8\x06", "xxxxxx"));
        SetOnlineStatus_Func = (SetOnlineStatus_pt)Scanner::ToFunctionStart(Scanner::Find("\x83\xFE\x03\x77\x40\xFF\x24\xB5\x00\x00\x00\x00\x33\xC0", "xxxxxxxx????xx"));
        AddFriend_Func = (AddFriend_pt)Scanner::ToFunctionStart(Scanner::Find("\x8B\x75\x10\x83\xFE\x03\x74\x65", "xxxxxxxx"));

        address = Scanner::Find("\x83\xf8\x03\x74\x1d\x83\xf8\x04\x74\x18", "xxxxxxxxxx");
        if (address)
            address = Scanner::FindInRange("\x50\xe8", "xx", 1, address, address + 0x32);
        RemoveFriend_Func = (RemoveFriend_pt)Scanner::FunctionFromNearCall(address);

        // GW::UI::RegisterUIMessageCallback(&OnUpdateFriendStatusEvent_entry, GW::UI::UIMessage::kFriendUpdated, OnFriendUpdated);

        //GW::EventMgr::RegisterEventCallback(&OnUpdateFriendStatusEvent_entry, EventMgr::EventID::kSendFriendState, OnSendFriendState_Event);
        //GW::EventMgr::RegisterEventCallback(&OnUpdateFriendStatusEvent_entry, EventMgr::EventID::kRecvFriendState, OnRecvFriendState_Event);

        GWCA_INFO("[SCAN] FriendList_Addr = %p", FriendList_Addr);
        GWCA_INFO("[SCAN] FriendStatusHandler = %p", FriendEventHandler_Func);
        GWCA_INFO("[SCAN] SetOnlineStatus = %p", SetOnlineStatus_Func);
        GWCA_INFO("[SCAN] AddFriend_Func = %p", AddFriend_Func);
        GWCA_INFO("[SCAN] RemoveFriend_Func = %p", RemoveFriend_Func);

#ifdef _DEBUG
        GWCA_ASSERT(FriendList_Addr);
        GWCA_ASSERT(FriendEventHandler_Func);
        GWCA_ASSERT(SetOnlineStatus_Func);
        GWCA_ASSERT(AddFriend_Func);
        GWCA_ASSERT(RemoveFriend_Func);
#endif
		Logger::AssertAddress("FriendList_Addr", FriendList_Addr, "FriendList Module");
		Logger::AssertAddress("FriendEventHandler_Func", (uintptr_t)FriendEventHandler_Func, "FriendList Module");
		Logger::AssertAddress("SetOnlineStatus_Func", (uintptr_t)SetOnlineStatus_Func, "FriendList Module");
		Logger::AssertAddress("AddFriend_Func", (uintptr_t)AddFriend_Func, "FriendList Module");
		Logger::AssertAddress("RemoveFriend_Func", (uintptr_t)RemoveFriend_Func, "FriendList Module");

        if(FriendEventHandler_Func)
			Logger::AssertHook("FriendEventHandler_Func", HookBase::CreateHook((void**)&FriendEventHandler_Func, OnFriendEventHandler, (void**)&FriendEventHandler_Ret), "FriendList Module");
        //Logger::Instance().LogInfo("############ FriendListMgr initialization completed ############");
    }

    void EnableHooks() {
        //return; // Temporarily disable gamethread hooks to investigate issues
        if (FriendEventHandler_Func)
            HookBase::EnableHooks(FriendEventHandler_Func);
    }

    void DisableHooks() {
        if(FriendEventHandler_Func)
            HookBase::DisableHooks(FriendEventHandler_Func);
    }

    void Exit() {
        HookBase::RemoveHook(FriendEventHandler_Func);
    }
}

namespace GW {

    Module FriendListModule = {
        "FriendListModule",  // name
        NULL,               // param
        ::Init,             // init_module
        ::Exit,             // exit_module
        ::EnableHooks,               // enable_hooks
        ::DisableHooks,               // disable_hooks
    };

    FriendList *FriendListMgr::GetFriendList() {
        return (FriendList *)FriendList_Addr;
    }

    bool FriendListMgr::SetFriendListStatus(FriendStatus status) {
        return SetOnlineStatus_Func ? SetOnlineStatus_Func(status), true : false;
    }

    void FriendListMgr::RegisterFriendStatusCallback(
        HookEntry *entry,
        const FriendStatusCallback& callback)
    {
        RemoveFriendStatusCallback(entry);
        FriendStatus_callbacks[entry] = callback;
    }

    void FriendListMgr::RemoveFriendStatusCallback(
            HookEntry *entry)
    {
        auto found = FriendStatus_callbacks.find(entry);
        if (found != FriendStatus_callbacks.end())
            FriendStatus_callbacks.erase(found);
    }

    Friend *FriendListMgr::GetFriend(const wchar_t *alias, const wchar_t *playing, FriendType type) {
        if (!(alias || playing)) return nullptr;
        const auto *fl = GetFriendList();
        if (!fl) return nullptr;
        auto &friends = fl->friends;
        for (auto it : friends) {
            if (!(it && (type == FriendType::Unknow || it->type == type))) continue;
            if (alias && !wcsncmp(it->alias, alias, 20))
                return it;
            if (playing && !wcsncmp(it->charname, playing, 20))
                return it;
        }
        return nullptr;
    }

    Friend *FriendListMgr::GetFriend(uint32_t index) {
        const auto *fl = GetFriendList();
        if (!fl || index >= fl->friends.size())
            return NULL;
        return fl->friends[index];
    }

    Friend *FriendListMgr::GetFriend(const uint8_t *uuid) {
        const auto fl = GetFriendList();
        auto& friends = fl->friends;
        for (auto it : friends) {
            if (it && memcmp(it->uuid, uuid, 16) == 0)
                return it;
        }
        return nullptr;
    }

    uint32_t FriendListMgr::GetNumberOfFriends(FriendType type) {
        const auto fl = GetFriendList();
        if (!fl) return 0;
        switch (type) {
        case FriendType::Friend:
            return fl->number_of_friend;
        case FriendType::Ignore:
            return fl->number_of_ignore;
        case FriendType::Player:
            return fl->number_of_partner;
        case FriendType::Trade:
            return fl->number_of_trade;
        default:
            return 0;
        }
    }

    uint32_t FriendListMgr::GetNumberOfIgnores() {
        return GetNumberOfFriends(FriendType::Ignore);
    }

    uint32_t FriendListMgr::GetNumberOfPartners() {
        return GetNumberOfFriends(FriendType::Player);
    }

    uint32_t FriendListMgr::GetNumberOfTraders() {
        return GetNumberOfFriends(FriendType::Trade);
    }

    FriendStatus FriendListMgr::GetMyStatus() {
        const auto *fl = GetFriendList();
        return fl ? fl->player_status : FriendStatus::Offline;
    }

    static bool InternalAddFriend(FriendType type, const wchar_t *name, const wchar_t *alias)
    {
        if (!AddFriend_Func) return false;
        wchar_t* buffer = 0;
        if (!alias) {
            buffer = new wchar_t[wcslen(name) + 1];
            GWCA_ASSERT(buffer);
            wcscpy(buffer, name);
            alias = buffer;
        }
        AddFriend_Func(name, alias, type);
        if (buffer)
            delete[] buffer;
        return true;
    }

    bool FriendListMgr::AddFriend(const wchar_t *name, const wchar_t *alias)
    {
        return InternalAddFriend(FriendType::Friend, name, alias);
    }

    bool FriendListMgr::AddIgnore(const wchar_t *name, const wchar_t *alias)
    {
        return InternalAddFriend(FriendType::Ignore, name, alias);
    }

    bool FriendListMgr::RemoveFriend(Friend *_friend)
    {
        if (!(_friend && RemoveFriend_Func))
            return false;
        RemoveFriend_Func(_friend->uuid, _friend->alias, 0);
        return true;
    }
} // namespace GW
