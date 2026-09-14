package realtime

import (
	"net/http"

	"servise-module/server/internal/config"
	io "github.com/zishang520/socket.io/servers/socket/v3"
	"github.com/zishang520/socket.io/v3/pkg/types"
)

type Hub struct {
	io *io.Server
}

func New(cfg *config.Config) *Hub {
	opts := io.DefaultServerOptions()
	origins := make([]any, 0, len(cfg.Origins))
	for _, origin := range cfg.Origins {
		origins = append(origins, origin)
	}
	cors := &types.Cors{Origin: origins, Credentials: ptr(true)}
	opts.SetCors(cors)
	server := io.NewServer(nil, opts)
	server.On("connection", func(clients ...any) {
		if len(clients) == 0 {
			return
		}
		socket, ok := clients[0].(*io.Socket)
		if !ok {
			return
		}
		socket.On("disconnect", func(args ...any) {})
	})
	return &Hub{io: server}
}

func (h *Hub) Handler() http.Handler {
	return h.io.ServeHandler(nil)
}

func (h *Hub) JobUpdated(job any) {
	if h == nil || h.io == nil {
		return
	}
	h.io.Emit("job:updated", job)
}

func (h *Hub) Close() {
	if h != nil && h.io != nil {
		h.io.Close(nil)
	}
}

func ptr[T any](v T) *T { return &v }
