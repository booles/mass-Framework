//=========================================
// 事件系统 v8
//==========================================
define("event", top.dispatchEvent ?  ["$node"] : ["$node","$event_fix"],function(){
    $.log("已加载event模块v8")
    var facade = $.event = $.event || {};
    $.Object.merge(facade,{
        eventAdapter:{ } //添加或增强二级属性eventAdapter
    });
    var adapter = $.event.eventAdapter, rhoverHack = /(?:^|\s)hover(\.\S+|)\b/
    var bindTop = !adapter.input;//如果没有加载event_fix模块,也就没有input分支,也就说明其是支持dispatchEvent API
    $.eventSupport = function( eventName, el ) {
        el = el || document.createElement("div");
        eventName = "on" + eventName;
        var ret = eventName in el;
        if ( el.setAttribute && !ret ) {
            el.setAttribute( eventName, "" );
            ret = typeof el[ eventName ] === "function";
            el.removeAttribute(eventName);
        }
        el = null;
        return ret;
    };
    /**
     * 从事件类型中分解出有用的信息
     * @param {String} event 事件类型
     * @param {String|Boolean|Undefined} live 用于判定是否使用代理
     */
    var Event = function(event, live){
        var parts = event.split('.');
        var ns = parts.slice(1).sort().join(' ');
        var type = parts[0], hack, tmp;//input -> change -> propertychange
        while( (hack = adapter[ type ]) ){
            tmp = hack[ live ? "delegateType" : "bindType" ];
            if( tmp ){
                type = tmp
            }else{
                break
            }
        }
        //比如在chrome下fire mouseenter, 到这里type为mouseover, origType为mouseenter
        this.type = type;          //事件类型
        this.origType = parts[0]   //原事件类型
        this.live = live;          //是否使用了事件代理,可以是正则,字符串,布尔或空值
        this.ns =   ns,            //命名空间
        this.rns =  ns ? new RegExp("(^|\\.)" + ns.replace(' ', ' .* ?') + "(\\.|$)") : null
    }
    //events为要过滤的集合,后面个参数为过滤条件
    function findHandlers( events, hash, fn, live ) {
        return events.filter(function(desc) {
            return desc && (!hash.rns || hash.rns.test(desc.ns))  //通过事件类型进行过滤
            && (!hash.origType || hash.origType === desc.origType) //通过命名空间进行进行过滤
            && (!fn || fn.uniqueNumber === desc.uuid)              //通过uuid进行过滤
            && (!live || live === desc.live || live === "**" && desc.live )//通过选择器进行过滤
        })
    }
    Event.prototype = {
        toString: function(){
            return "[object Event]"
        },
        preventDefault: function() {
            this.defaultPrevented = true;
            var e = this.originalEvent || {};
            if (e && e.preventDefault ) {
                e.preventDefault();
            }// 如果存在returnValue 那么就将它设为false
            e.returnValue = false;
            return this;
        },
        stopPropagation: function() {
            var e = this.originalEvent || {};
            if (e && e.stopPropagation ) {
                e.stopPropagation();
            } 
            //http://opera.im/kb/userjs/
            e.cancelBubble = this.propagationStopped = true;
            return this;
        },
        stopImmediatePropagation: function() {
            this.isImmediatePropagationStopped = true;
            this.stopPropagation();
            return this;
        }
    }
    $.Event = Event;
    $.mix(facade,{
        //addEventListner API的支持情况:chrome 1+ FF1.6+	IE9+ opera 7+ safari 1+;
        //http://functionsource.com/post/addeventlistener-all-the-way-back-to-ie-6
        bind: function( target, hash ){//事件系统三大核心方法之一，绑定事件
            var bindTarget =  $[ "@bind" ] in target,//是否能直接绑定到目标对象上
            data = $._data( target ),              //是否能绑定事件
            types  = hash.type,                      //原有的事件类型,可能是复数个
            live   = hash.live;                      //是否使用事件代理
            if( !data ){
                return
            }
            if( bindTarget ){                       //处理DOM的hover事件
                types = types.replace( rhoverHack, "mouseover$1 mouseout$1" );
            }
            var events = data.events || (data.events = []);
            hash.uuid = $.getUid( hash.fn );       //确保hash.uuid与fn.uuid一致
            types.replace( $.rword, function( t ){
                var desc = new $.Event( t, live), type = desc.origType;
                $.mix(desc, {
                    currentTarget: target,          //this,用于绑定数据的
                    index:  events.length           //记录其在列表的位置，在卸载事件时用
                }, hash, false);
                events.push( desc );               //用于事件拷贝
                var count = events[ type+"_count" ] = ( events[ type+"_count" ] | 0 )+ 1;
                var hack = adapter[ desc.type ] || {};
                if( count == 1 ){
                    var handle = data[type+"_handle"] = facade.curry( desc );     //  一个curry
                    if( !hack.setup || hack.setup( desc ) === false  ) {
                        if( bindTop && !bindTarget  ){//如果不能绑到当前对象上,尝试绑到window上
                            target = window;
                        }
                        //此元素在此事件类型只绑定一个回调
                        $.bind(target, desc.type, handle, false);
                    }
                }
            //mass Framework早期的事件系统与jQuery都脱胎于 Dean Edwards' addEvent library
            //对于每个元素的某一种事件只绑定一个代理回调，通过它执行用户的所有回调，
            //藉此解决this指向，event存无与标准化，回调顺序这三大问题
            //jquery的创新在于使用多投事件API取代DOM 0事件绑定，解决对DOMMouseScroll，
            //DOMContentLoaded，DOMAttrModified的绑定，并引入命名空间与实现事件冒充，事件代理，
            //以及让无论是自定义事件与原生事件都能沿着DOM树人为地冒泡
            });
        },

        curry: function( hash ){// 这是元信息,不要污染这个对象
            var fn =  function( event){//真正的事件对象
                var type = hash.origType;
                var ctarget = hash.currentTarget//原来绑定事件的对象
                var more = event.more || {};
                //第一个分支防止在旧式IE下,fire click时二次触发 
                //第二个分支防止在chrome下,fire mouseover时,把用于冒充mouseenter用的mouseover也触发了
                if(facade.type == type || more.origType && more.origType !== type ){
                    return
                }
                var queue = ( $._data( ctarget, "events") || [] );
                //如果是自定义事件, 或者旧式IE678, 或者需要事件冒充
                if( !event.originalEvent || !bindTop || hash.type !== type ){
                    event = facade.fix( hash, event, type );
                }
                var args = [ event ].concat( event.args ||  [] ), result,lives = [],  handlers = []
                for ( var i = 0, desc; desc = queue[i++]; ) {
                    if(desc.live){
                        lives.push(desc)
                    }else{
                        handlers.push(desc)
                    }
                }
                //DOM树的每一个元素都有可以作为代理节点
                if ( lives.length && !(event.button && type === "click") ) {
                    for ( var k = 0, cur; (cur = lives[k++]) ; ) {
                        var cc = cur.currentTarget
                        var nodes = $(cc).find(cur.live);
                        for(var node = event.target; node != cc; node = node.parentNode || cc ){
                            if ( node.disabled !== true || type !== "click" ) {
                                if( nodes.index(node) !== -1){
                                    handlers.push({
                                        elem: node,
                                        fn:   cur.fn,
                                        origType: cur.origType,
                                        ns:   cur.ns
                                    });
                                }
                            }
                        }
                    }
                }
                for ( var i = 0, desc; desc = handlers[i++]; ) {
                    if ( ( event.type == desc.origType ) &&
                        (!event.rns || event.rns.test( desc.ns )) ) {
                        //谁绑定了事件,谁就是事件回调中的this
                        result = desc.fn.apply( desc.elem || ctarget, args);
                        desc.times--;
                        if(desc.times === 0){//如果有次数限制并到用光所有次数，则移除它
                            facade.unbind( this, desc)
                        }
                        if ( result !== void 0 ) {
                            event.result = result;
                            if ( result === false ) {
                                event.preventDefault();
                                event.stopPropagation();
                            }
                        }
                        if ( event.propagationStopped ) {
                            break;
                        }
                    }
                }

            }
            fn.uuid = hash.uuid;
            return fn;
        },
        _dispatch: function( list, event, type ){//level2 API 用于事件冒充
            event.more = event.more ||{}
            event.more.type = type
            for(var i in list){
                if( list.hasOwnProperty(i)){
                    facade.dispatch( list[ i ], event, type );
                }
            }
        },
        dispatch: function( target, event, type ){// level2 API 用于旧式的$.event.fire中
            var handle = $._data(target, (type || event.type) +"_handle" );//取得此元素此类型的第一个quark
            handle && handle.call( target, event )
        },
        //将真事件对象的成员赋给伪事件对象，抹平浏览器差异
        fix: function( event, real, type){
            if( !event.originalEvent ){
                var hash = event, toString = hash.toString;//IE无法遍历出toString;
                event = $.Object.merge({}, hash);//这里event只是一个伪事件对象
                for( var p in real ){
                    if( !(p in hash) ){
                        event[p] = real[p]
                    }
                }
                for( var p in real.more ){
                    if( !(p in hash) ){
                        event[p] = real.more[p]
                    }
                }
                event.toString = toString;
                event.originalEvent = real;
                event.timeStamp = Date.now();
                //如果不存在target属性，为它添加一个
                if ( !event.target ) {
                    event.target = event.srcElement || document;
                }
                //safari的事件源对象可能为文本节点，应代入其父节点
                if ( event.target.nodeType === 3 ) {
                    event.target = event.target.parentNode;
                }
                event.metaKey = !!event.ctrlKey; // 处理IE678的组合键

                if( /^(?:mouse|contextmenu)|click/.test( type ) ){
                    if ( event.pageX == null && event.clientX != null ) {  // 处理鼠标事件
                        var doc = event.target.ownerDocument || document,
                        body = doc.body;
                        event.pageX = event.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) 
                        - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
                        event.pageY = event.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 )
                        - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
                    }
                    //如果不存在relatedTarget属性，为它添加一个
                    if ( !event.relatedTarget && event.fromElement ) {
                        event.relatedTarget = event.fromElement === event.target ? event.toElement : event.fromElement;
                    }
                    //标准浏览判定按下鼠标哪个键，左1中2右3
                    var button = event.button
                    //IE event.button的意义 0：没有键被按下 1：按下左键 2：按下右键 3：左键与右键同时被按下 4：按下中键 5：左键与中键同时被按下 6：中键与右键同时被按下 7：三个键同时被按下
                    if ( !event.which && isFinite(button) ) {
                        event.which  = [0,1,3,0,2,0,0,0][button];//0现在代表没有意义
                    }
                    if( type === "mousewheel" ){ //处理滚轮事件
                        if ("wheelDelta" in real){//统一为±120，其中正数表示为向上滚动，负数表示向下滚动
                            // http://www.w3help.org/zh-cn/causes/SD9015
                            var delta = real.wheelDelta
                            //opera 9x系列的滚动方向与IE保持一致，10后修正
                            if( window.opera && opera.version() < 10 )
                                delta = -delta;
                            event.wheelDelta = Math.round(delta); //修正safari的浮点 bug
                        }else if( "detail" in real ){
                            event.wheelDelta = -real.detail * 40;//修正FF的detail 为更大众化的wheelDelta
                        }
                    }
                }else if ( event.which == null ) {//处理键盘事件
                    event.which = event.charCode != null ? event.charCode : event.keyCode;
                }else if( window.Touch && event.touches && event.touches[0] ){
                    event.pageX = event.touches[0].pageX//处理触摸事件
                    event.pageY = event.touches[0].pageY
                }
            }
            if( type ){
                event.type = type
            }
            return event;
        },
        //外部的API已经确保typesr至少为空字符串
        unbind: function( target, hash ) {//事件系统三大核心方法之一，卸载事件
            var events = $._data( target, "events");
            if( !events ) return;
            var types = hash.type || "", live = hash.live, bindTarget = $["@bind"] in target;
            if( bindTarget ){ //处理DOM的hover事件
                types = types.replace( rhoverHack, "mouseover$1 mouseout$1" );
            }
            types.replace( $.rword, function( t ){
                var desc = new $.Event( t, live ), type = desc.origType, hack = adapter[ type ] || {};
                findHandlers( events, desc , hash.fn, live ).forEach( function(desc){
                    if( --events[type+"_count"] == 0 ){
                        if( !hack.teardown || hack.teardown( desc ) === false  ) {
                            if( bindTarget === false && bindTop ){//如果不能绑到当前对象上,尝试绑到window上
                                target = window;
                            }
                            var handle = $._data(target, type+"_handle");
                            $.unbind( target, desc.type, handle, false );
                        }
                        $.removeData( target, type +"_handle", true );
                        delete events[ type+"_count"];
                    }
                    events[ desc.index ] = null;
                })
            });
            for ( var i = events.length; i >= 0; i-- ) {
                if (events[i] == null){
                    events.splice(i, 1);
                }
            }
            if( !events.length ){
                $.removeData( target, "events") ;
            }
        }
    })
    if( bindTop ){//事件系统三大核心方法之一，触发事件
        facade.fire = function( type ){
            var bindTarget = $["@bind"] in this, initEvent = true, more, event
            var target = bindTarget ? this : window;
            if(typeof init == "string"){
                more = new Event( type );
            }else if(type && type.preventDefault){
                if(!( type instanceof $.Event) ){//如果是真的事件对象
                    more = new Event( type.type );
                    initEvent = false;
                }else{
                    more = type;//如果是$.Event实例
                }
            }
            if(initEvent && more){
                type = more.type;
                var doc = target.ownerDocument || target.document || target || document;
                event = doc.createEvent(eventMap[type] || "CustomEvent");
                if(/^(focus|blur|select|submit|reset)$/.test(type)){
                    target[type] && target[type]()
                }
                event.initEvent( type, true,true, doc.defaultView,1);//, doc.defaultView
            }
            event.args = [].slice.call( arguments, 1 ) ;
            event.more = more
            target.dispatchEvent(event);
        }
    }
    var rmapper = /(\w+)_(\w+)/g;
    //以下是用户使用的API
    $.implement({
        toggle: function(/*fn1,fn2,fn3*/){
            var fns = Array.apply([], arguments), i = 0;
            return this.click(function(e){
                var fn  = fns[i++] || fns[i = 0, i++];
                fn.call( this, e );
            })
        },
        hover: function( fnIn, fnOut ) {
            return this.mouseenter( fnIn ).mouseleave( fnOut || fnIn );
        },
        delegate: function( selector, types, fn, times ) {
            return this.on( types, selector, fn, times);
        },
        live: function( types, fn, times ) {
            $( this.ownerDocument ).on( types, this.selector, fn, times );
            return this;
        },
        one: function( types, fn ) {
            return this.on( types, fn, 1 );
        },
        undelegate: function(selector, types, fn ) {/*顺序不能乱*/
            return arguments.length == 1 ? this.off( selector, "**" ) : this.off( types, fn, selector );
        },
        die: function( types, fn ) {
            $( this.ownerDocument ).off( types, fn, this.selector || "**", fn );
            return this;
        },
        fire: function() {
            var args = arguments;
            return this.each(function() {
                $.event.fire.apply(this, args );
            });
        }
    });


    //这个迭代器产生四个重要的事件绑定API on off bind unbind
    var rtypes = /^[a-z0-9_\-\.\s\,]+$/i
    "on_bind,off_unbind".replace( rmapper, function(_,method, mapper){
        $.fn[ method ] = function(types, selector, fn ){
            if ( typeof types === "object" ) {
                for ( var type in types ) {
                    $.fn[ method ](this, type, selector, types[ type ], fn );
                }
                return this;
            }
            var hash = {};
            for(var i = 0 ; i < arguments.length; i++ ){
                var el = arguments[i];
                if(typeof el == "number"){
                    hash.times = el;
                }else if(typeof el == "function"){
                    hash.fn = el
                }
                if(typeof el === "string"){
                    if(hash.type != null){
                        hash.live = el.trim();
                    }else{
                        hash.type = el.trim();//只能为字母数字-_.空格
                        if(!rtypes.test(hash.type)){
                            throw "hash.type should be a combination of this event type and the namespace!"
                        }
                    }
                }
            }
            if(method === "on"){
                if( !hash.type || !hash.fn ){
                    $.log("$.fn."+ method + " occur error: type and callback must be specified!");
                    return this;
                }
                hash.times = hash.times > 0  ? hash.times : Infinity;
            }
            return this.each(function() {
                facade[ mapper ]( this, hash );
            });
        }
        $.fn[ mapper ] = function(){// $.fn.bind $.fn.unbind
            return $.fn[ method ].apply(this, arguments );
        }
    });
    var mouseEvents =  "contextmenu,click,dblclick,mouseout,mouseover,mouseenter,mouseleave,mousemove,mousedown,mouseup,mousewheel,"
    var eventMap = $.oneObject(mouseEvents, "MouseEvents");
    var types = mouseEvents +",keypress,keydown,keyup," + "blur,focus,focusin,focusout,"+
    "abort,error,load,unload,resize,scroll,change,input,select,reset,submit,input"
    types.replace( $.rword, function( type ){//这里产生以事件名命名的快捷方法
        eventMap[type] = eventMap[type] || (/key/.test(type) ? "KeyboardEvent" : "HTMLEvents")
        $.fn[ type ] = function( callback ){
            return callback?  this.bind( type, callback ) : this.fire( type );
        }
    });
    /**
mouseenter/mouseleave/focusin/focusout已为标准事件，经测试IE5+，opera11,FF10都支持它们
详见http://www.filehippo.com/pl/download_opera/changelog/9476/
         */
    if( !+"\v1" || !$.eventSupport("mouseenter")){//IE6789不能实现捕获与safari chrome不支持
        "mouseenter_mouseover,mouseleave_mouseout".replace(rmapper, function(_, type, mapper){
            adapter[ type ]  = {
                setup: function( desc ){//使用事件冒充
                    desc[type+"_handle"] = $.bind( desc.currentTarget, mapper, function( event ){
                        var target = desc.currentTarget
                        var related = event.relatedTarget;
                        if(desc.live || !related || (related !== target && !$.contains( target, related )) ){
                            facade.dispatch( target, event, type );
                        }
                    })
                },
                teardown: function( desc ){
                    $.unbind( desc.currentTarget, mapper, desc[ type+"_handle" ] );
                }
            };
            if(!$.eventSupport("mouseenter")){
                adapter[ type ].bindType =  adapter[ type ].delegateType = mapper
            }

        });
    }
    //现在只有firefox不支持focusin,focusout事件,并且它也不支持DOMFocusIn,DOMFocusOut,不能像DOMMouseScroll那样简单冒充
    if( !$.support.focusin ){
        "focusin_focus,focusout_blur".replace(rmapper, function(_,type, mapper){
            var notice = 0, handler = function (event) {
                var src = event.target;
                do{//模拟冒泡
                    if( $._data(src, "events") ) {
                        facade._dispatch( [ src ], event, type );
                    }
                } while (src = src.parentNode );
            }
            adapter[ type ] = {
                setup: function( ) {
                    if ( notice++ === 0 ) {
                        document.addEventListener( mapper, handler, true );
                    }
                },
                teardown: function() {
                    if ( --notice === 0 ) {
                        document.removeEventListener( mapper, handler, true );
                    }
                }
            };
        });
    }
    try{
        //FF需要用DOMMouseScroll事件模拟mousewheel事件
        document.createEvent("MouseScrollEvents");
        adapter.mousewheel = {
            bindType    : "DOMMouseScroll",
            delegateType: "DOMMouseScroll"
        }
        try{
            //可能末来FF会支持标准的mousewheel事件，则需要删除此分支
            document.createEvent("WheelEvent");
            delete adapter.mousewheel;
        }catch(e){ };

    }catch(e){};
})
    /**
2011.8.14 更改隐藏namespace,让自定义对象的回调函数也有事件对象
2011.9.17 事件发送器增加一个uniqueID属性
2011.9.21 重构bind与unbind方法 支持命名空间与多事件处理
2011.9.27 uniqueID改为uniqueNumber 使用$._data存取数据
2011.9.29 简化bind与unbind
2011.10.13 emit模块更名dispatcher 模块 升级为v2
2011.10.23 简化facade.handle与fire
2011.10.14 强化delegate 让快捷方法等支持fire 修复delegate BUG
2011.10.21 修复focusin focsuout的事件代理 增加fixAndDispatch处理事件冒充
2011.11.23 简化rquickIs
2011.12.20 修正在当前窗口为子窗口元素绑定错误时，在IE678下，事件对象错误的问题
2011.12.20 修正rhoverHack正则，现在hover可以作为命名空间了
2012.1.13 dispatcher模块更名target模块 升级为v3
2012.2.7 重构change，允许change事件可以通过fireEvent("onchange")触发
2012.2.8 添加mouseenter的分支判定，增强eventSupport
2012.2.9 完美支持valuechange事件
2012.4.1 target模块与event模块合并， 并分割出event_fix模块，升级为v4
2012.4.12 修正触摸屏下的pageX pageY
2012.5.1 让$.fn.fire支持自定义事件
2012.5.24 利用customEvent,initCustomEvent, dispatchEvent大大提高性能,升级到v5
2012.5.26 修正自定义事件target与this的指向
2012.5.28 Fix quickParse BUG
2012.5.29 利用Object.defineProperty打破事件对象的封装
2012.6.6 addEventListenter也能绑定自定义事件, 一些兼容逻辑移到event_fix中去 升级到v6
2012.8.17 $.EventTarget不再自带uniqueNumber，此属性会在用户第一次调用bind,unbind方法时再为原对象添加此属性
2012.8.31 移除$.EventTarget,以后所有自定义事件由操作流代劳,升级到v7

http://jsbin.com/efalu/7 input例子
//http://hacks.mozilla.org/2012/05/dom-mutationobserver-reacting-to-dom-changes-without-killing-browser-performance/
ECMAScript Edition3, 5 execution context and scope chain http://user.qzone.qq.com/153720615/blog/1339563690#!app=2&pos=1323177459
DOM Level3 Event对象新增API 浏览器实现 一览表:

IE9+(全部实现)(但是,IE9,IE10的e.isTrusted有bug .link.click();后出发的也是true...)

chrome5 - chrome17 部分实现.(e.isTrusted未支持),

Safari5 才部分实现.(e.isTrusted未支持).

Opera10 - Opera11部分实现(stopImmediatePropagation以及e.isTrusted未实现，而仅仅实现了defaultPrevented).
Opera12 部分实现 (stopImmediatePropagation,仍然为实现, 但实现了e.isTrusted)

Firefox1.0 - Firefox5 (stopImmediatePropagation和defaultPrevented 未实现,仅仅实现了e.isTrusted,isTrusted,在成为标准前，是MOZ的私有实现啊)
Firefox6 - Firefox10 (仅未实现stopImmediatePropagation)
Firefox11(终于实现了stopImmediatePropagation)
isTrusted 表明当前事件是否是由用户行为触发(比如说真实的鼠标点击触发一个click事件),
还是由一个脚本生成的(使用事件构造方法,比如event.initEvent)
//不要把事件写在标签内
http://www.cnblogs.com/_franky/archive/2010/07/20/1781513.html
和 submit 事件的另类是一样的。
submit 挺有意思的，不知道有人研究过没。我那天想了想，感觉也是历史原因使然——和别的事件不一样，执行 xxx 方法触发 xxx 事件，执行 submit 方法后是不会触发 submit 事件的，submit 事件只能由用户的行为触发。
所有浏览器都没这么做。原因是太多人在 submit 事件里做表单验证，通过了就调用 form.submit() 方法，而不是没通过调用 e.preventDefault() 什么的。

如果调用 submit 方法再触发一次 submit 事件的话，就进入死循环了……

http://heroicyang.com/blog/javascript-timers.html
http://heroicyang.com/blog/javascript-event-loop.html
http://jquerymobile.com/blog/2012/08/01/announcing-jquery-mobile-1-2-0-alpha/
     */
    //addEventListener polyfill 1.0 / Eirik Backer / MIT Licence
